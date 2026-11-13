// Bộ máy mô phỏng: tạo "lượt chạy" đi qua dây chuyền các phòng, để xem công ty vận hành.
// Giai đoạn 10 sẽ thay phần "làm việc" bằng agent AI thật, giữ nguyên cách điều phối và sự kiện.

import { COURIER_TITLES } from './seed.js';

// Dây chuyền theo loại sản phẩm. Mỗi phần tử là một chặng; chặng có nhiều phòng thì các phòng chạy song song.
export const PLANS = {
  web:     [['01'], ['02'], ['03'], ['05'], ['06', '07', '09'], ['10'], ['11'], ['12']],
  exe:     [['01'], ['02'], ['03'], ['05'], ['07', '06'], ['10'], ['11'], ['12']],
  landing: [['01'], ['02'], ['05'], ['06', '09'], ['10'], ['12']],
  mobile:  [['01'], ['02'], ['03'], ['05'], ['08', '07'], ['10'], ['11'], ['12']]
};
export const KIND_LABEL = { web: 'Ứng dụng web', exe: 'Phần mềm máy tính (.exe)', landing: 'Trang đích', mobile: 'Ứng dụng di động' };
export const STAGE_LABEL = {
  '01': 'Chia việc và lập kế hoạch', '02': 'Chốt phạm vi sản phẩm', '03': 'Viết yêu cầu chi tiết', '04': 'Nghiên cứu hỗ trợ',
  '05': 'Thiết kế giao diện', '06': 'Lập trình giao diện', '07': 'Lập trình máy chủ', '08': 'Lập trình di động',
  '09': 'Phát triển trang web', '10': 'Chạy kiểm thử', '11': 'Rà soát an ninh', '12': 'Triển khai'
};
const DEMO_TITLES = ['Web bán cà phê rang xay Đà Lạt', 'App đặt lịch spa', 'Phần mềm quản lý kho', 'Landing page khoá học tiếng Anh', 'Web đặt bàn nhà hàng', 'App theo dõi chi tiêu'];
const REVIEW_DEPTS = new Set(['10', '11']);     // hai phòng này hiện trạng thái "Đang kiểm"
const MAX_ACTIVE_RUNS = 8;
// Mượn người: khi một phòng đã hết người rảnh mà vẫn còn việc chờ, mượn một người đang rảnh ở phòng khác sang ngồi bàn trống.
// BORROW_CAP = số người mượn tối đa cùng lúc vào mỗi phòng (không vượt số bàn trống trong phòng; phòng 01 và 09 kín bàn nên không mượn được).
export const BORROW_CAP = { '02': 2, '03': 2, '05': 2, '06': 2, '07': 2, '08': 2, '10': 2, '11': 2, '12': 2 };
export const MAX_BORROWED = 4;               // toàn công ty cùng lúc, để văn phòng không bị xáo trộn
const SPEEDS = [1, 2, 4, 8];

export class SimError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createSim({ db, hub, config = {}, random = Math.random }) {
  // holdViewer / holdNoViewer: giây chờ dự phòng khi có / không có người đang xem cảnh 3D
  const cfg = { stageSeconds: [8, 18], autoDemo: false, maxAutoRuns: 3, borrowTravel: 14, holdViewer: 120, holdNoViewer: 4, ...(config.sim || {}) };
  const depts = db.prepare('SELECT id, code FROM departments').all();
  const idByCode = new Map(depts.map(d => [d.code, d.id]));
  const agentsByCode = new Map(), homeOf = new Map(), reserved = new Set(), leads = new Set();
  for (const a of db.prepare('SELECT a.id, a.title, a.is_lead AS lead, d.code FROM agents a JOIN departments d ON d.id = a.dept_id ORDER BY a.id').all()) {
    if (!agentsByCode.has(a.code)) agentsByCode.set(a.code, []);
    agentsByCode.get(a.code).push(a.id);
    homeOf.set(a.id, a.code);
    if (COURIER_TITLES.includes(a.title)) reserved.add(a.id);      // điều phối viên: không nhận việc chuyên môn
    if (a.lead) leads.add(a.id);
  }

  const q = {
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    insRun: db.prepare('INSERT INTO runs (title, kind) VALUES (?, ?)'),
    updRun: db.prepare("UPDATE runs SET state = ?, stage = ?, finished_at = CASE WHEN ? = 'running' THEN NULL ELSE datetime('now') END WHERE id = ?"),
    insItem: db.prepare('INSERT INTO work_items (run_id, stage, dept_id, title, support, duration) VALUES (?,?,?,?,?,?)'),
    startItem: db.prepare("UPDATE work_items SET state = 'working', agent_id = ?, started_at = datetime('now') WHERE id = ?"),
    doneItem: db.prepare("UPDATE work_items SET state = 'done', progress = 1, finished_at = datetime('now') WHERE id = ?"),
    setStatus: db.prepare('UPDATE agents SET status = ? WHERE id = ?'),
    doneCount: db.prepare("SELECT COUNT(*) n FROM runs WHERE state = 'done'")
  };
  const setting = (k, d) => { const r = q.getSetting.get(k); return r ? r.value : d; };

  // Khởi động: các lượt demo dang dở không được chạy tiếp, trả mọi agent về trạng thái rảnh.
  db.exec(`UPDATE work_items SET state = 'cancelled', finished_at = datetime('now') WHERE state IN ('queued','working');
           UPDATE runs SET state = 'cancelled', finished_at = datetime('now') WHERE state = 'running';
           UPDATE agents SET status = 'idle' WHERE status <> 'idle';`);

  // Đồng bộ với cảnh 3D: phòng kế tiếp chỉ bắt đầu khi hồ sơ đã tới tay trưởng phòng (cảnh 3D báo qua delivered()).
  // Không có ai đang mở cảnh 3D, hoặc tin báo bị mất, thì tự thả sau holdNoViewer / holdViewer giây thật để dây chuyền không bao giờ bị kẹt.
  let lastViewer = -1e9;
  const viewerAlive = () => Date.now() - lastViewer < 40000;
  const runs = new Map();            // chỉ các lượt đang chạy
  const busy = new Set();            // agent đang bận
  const statusOf = new Map();        // agentId -> trạng thái hiện tại
  let speed = SPEEDS.includes(Number(setting('sim.speed', 1))) ? Number(setting('sim.speed', 1)) : 1;
  let auto = setting('sim.auto', null) === null ? !!cfg.autoDemo : setting('sim.auto') === '1';
  let nextAuto = 2, wasActive = false, timer = null, lastMs = 0;

  const emit = (event, data) => hub?.broadcast?.(event, data);
  const duration = () => cfg.stageSeconds[0] + random() * (cfg.stageSeconds[1] - cfg.stageSeconds[0]);

  function setAgent(id, status) { statusOf.set(id, status); q.setStatus.run(status, id); }

  function addItems(run, stageIdx, fromCodes = []) {
    const codes = run.plan[stageIdx], holdFor = viewerAlive() ? cfg.holdViewer : cfg.holdNoViewer;
    for (const code of codes) {
      const item = { dept: code, stage: stageIdx, state: 'queued', progress: 0, duration: duration(), agentId: null, support: false, title: STAGE_LABEL[code],
        hold: fromCodes.length > 0, waitDocs: new Set(fromCodes), holdLeft: holdFor, holdReal: viewerAlive() };      // đang chờ hồ sơ của phòng trước chuyển tới
      item.id = Number(q.insItem.run(run.id, stageIdx, idByCode.get(code), `${STAGE_LABEL[code]}: ${run.title}`, 0, item.duration).lastInsertRowid);
      run.items.push(item);
    }
    // Phòng Nghiên cứu thỉnh thoảng được gọi hỗ trợ ở chặng viết yêu cầu hoặc thiết kế; không chặn dây chuyền.
    if (['03', '05'].includes(codes[0]) && random() < 0.4) {
      const item = { dept: '04', stage: stageIdx, state: 'queued', progress: 0, duration: duration() * 0.7, agentId: null, support: true, title: STAGE_LABEL['04'] };
      item.id = Number(q.insItem.run(run.id, stageIdx, idByCode.get('04'), `${STAGE_LABEL['04']}: ${run.title}`, 1, item.duration).lastInsertRowid);
      run.items.push(item);
      emit('handoff', { runId: run.id, from: codes[0], to: '04', title: run.title, support: true });
    }
  }

  // Chọn người để mượn cho phòng dept: đang rảnh, không phải trưởng phòng hay điều phối viên, phòng gốc của họ không có việc chờ.
  function pickLender(dept) {
    const cap = BORROW_CAP[dept] || 0; if (!cap) return null;
    let inDept = 0, total = 0; const queuedDepts = new Set();
    for (const run of runs.values()) for (const it of run.items) {
      if (it.state === 'working' && it.borrowed) { total++; if (it.dept === dept) inDept++; }
      else if (it.state === 'queued' && !it.hold) queuedDepts.add(it.dept);
    }
    if (inDept >= cap || total >= MAX_BORROWED) return null;
    const pool = [...homeOf.keys()].filter(id => !busy.has(id) && !reserved.has(id) && !leads.has(id) && homeOf.get(id) !== dept && !queuedDepts.has(homeOf.get(id)));
    const rd = pool.filter(id => homeOf.get(id) === '04');         // phòng Nghiên cứu (10 người) cho mượn trước
    const from = rd.length ? rd : pool;
    return from.length ? from[Math.floor(random() * from.length)] : null;
  }

  function assign() {
    for (const run of runs.values()) {
      for (const item of run.items) {
        if (item.state !== 'queued' || item.hold) continue;
        let free = (agentsByCode.get(item.dept) || []).filter(id => !busy.has(id) && !reserved.has(id)), borrowed = false;
        if (!free.length && !item.support) { const l = pickLender(item.dept); if (l != null) { free = [l]; borrowed = true; } }
        if (!free.length) continue;
        const id = free[Math.floor(random() * free.length)];
        busy.add(id);
        item.agentId = id; item.state = 'working'; item.borrowed = borrowed;
        item.travelReal = viewerAlive();                                                   // có người xem: chờ cảnh 3D báo đã tới bàn (arrived), dự phòng 120 giây thật
        item.travel = !borrowed ? 0 : (item.travelReal ? 120 : cfg.borrowTravel);           // không có người xem: tính theo giây mô phỏng
        q.startItem.run(id, item.id);
        setAgent(id, REVIEW_DEPTS.has(item.dept) ? 'reviewing' : 'working');
      }
    }
  }

  function finishItem(run, item) {
    item.state = 'done'; item.progress = 1;
    q.doneItem.run(item.id);
    busy.delete(item.agentId); setAgent(item.agentId, 'idle');
    if (item.support) return;
    const stageItems = run.items.filter(i => i.stage === item.stage && !i.support);
    if (!stageItems.every(i => i.state === 'done')) return;
    const from = run.plan[item.stage];
    const sender = Object.fromEntries(stageItems.map(i => [i.dept, i.agentId]));   // ai vừa làm xong ở từng phòng: để giao diện cho họ cầm hồ sơ đi giao
    run.stage = item.stage + 1;
    if (run.stage < run.plan.length) {
      addItems(run, run.stage, from);
      q.updRun.run('running', run.stage, 'running', run.id);
      for (const f of from) for (const t of run.plan[run.stage]) emit('handoff', { runId: run.id, from: f, to: t, title: run.title, agentId: sender[f] ?? null });
    } else {
      run.state = 'done';
      q.updRun.run('done', run.stage, 'done', run.id);
      for (const f of from) emit('handoff', { runId: run.id, from: f, to: 'CEO', title: run.title, delivered: true, agentId: sender[f] ?? null });
      runs.delete(run.id);
    }
  }

  function spawn({ title, kind } = {}) {
    if (runs.size >= MAX_ACTIVE_RUNS) throw new SimError(409, `Đang có ${runs.size} việc chạy cùng lúc, hãy đợi bớt rồi thử lại.`);
    const k = kind || 'web';
    if (!PLANS[k]) throw new SimError(400, 'Loại sản phẩm không hợp lệ.');
    const t = (title == null || String(title).trim() === '') ? DEMO_TITLES[Math.floor(random() * DEMO_TITLES.length)] : String(title).trim().slice(0, 80);
    const run = { id: Number(q.insRun.run(t, k).lastInsertRowid), title: t, kind: k, plan: PLANS[k], stage: 0, state: 'running', items: [] };
    runs.set(run.id, run);
    addItems(run, 0, ['CEO']);
    for (const to of run.plan[0]) emit('handoff', { runId: run.id, from: 'CEO', to, title: t });
    assign();
    broadcast();
    return summary(run);
  }

  function tick(dtSeconds) {
    const dt = dtSeconds * speed;
    for (const run of runs.values()) for (const it of run.items) {     // hết thời gian chờ dự phòng thì thả việc đang chờ hồ sơ
      if (it.state === 'queued' && it.hold && (it.holdLeft -= it.holdReal ? dtSeconds : dt) <= 0) it.hold = false;   // có người xem: tính giây thật; không có: tính giây mô phỏng nên tốc độ 4x/8x vẫn nhanh
    }
    assign();
    for (const run of [...runs.values()]) {
      for (const item of [...run.items]) {
        if (item.state !== 'working') continue;
        if (item.travel > 0) { item.travel = Math.max(0, item.travel - (item.travelReal ? dtSeconds : dt)); continue; }     // người mượn còn đang đi sang phòng này
        item.progress = Math.min(1, item.progress + dt / item.duration);
        if (item.progress >= 1) finishItem(run, item);
      }
    }
    assign();                        // việc vừa được tạo có thể nhận người ngay trong nhịp này
    if (auto && runs.size < cfg.maxAutoRuns) {
      nextAuto -= dt;
      if (nextAuto <= 0) { nextAuto = 6 + random() * 9; try { spawn({}); } catch { /* bỏ qua */ } }
    }
    if (runs.size || wasActive) broadcast();
    wasActive = runs.size > 0;
  }

  function summary(run) {
    return {
      id: run.id, title: run.title, kind: run.kind, kindLabel: KIND_LABEL[run.kind], stage: run.stage, total: run.plan.length,
      stages: run.plan.map((codes, i) => ({ depts: codes, state: i < run.stage ? 'done' : (i === run.stage ? 'current' : 'todo') })),
      items: run.items.filter(i => i.state !== 'done').map(i => ({ id: i.id, dept: i.dept, state: i.state, progress: Number(i.progress.toFixed(3)), title: i.title, agentId: i.agentId, support: i.support, inTransit: !!i.hold,
        borrowed: !!i.borrowed, from: i.borrowed ? homeOf.get(i.agentId) : null, travelling: (i.travel || 0) > 0 }))
    };
  }
  function snapshot() {
    const working = {};
    for (const [id, st] of statusOf) if (st !== 'idle') working[id] = st;
    const deptRows = depts.map(d => ({ code: d.code, total: (agentsByCode.get(d.code) || []).length,
      working: (agentsByCode.get(d.code) || []).filter(id => (statusOf.get(id) || 'idle') !== 'idle').length }));
    return {
      speed, auto, done: q.doneCount.get().n,
      runs: [...runs.values()].map(summary),
      depts: deptRows,
      agents: [...agentsByCode.values()].flat().map(id => ({ id, status: statusOf.get(id) || 'idle' })),
      overview: { working: Object.keys(working).length, projects: runs.size, borrowed: [...runs.values()].reduce((n, r) => n + r.items.filter(i => i.state === 'working' && i.borrowed).length, 0) }
    };
  }
  const broadcast = () => emit('tick', snapshot());

  // Cảnh 3D báo: hồ sơ của phòng `from` đã tới tay trưởng phòng `to` trong lượt runId → phòng `to` bắt đầu làm được.
  function delivered(runId, from, to) {
    const run = runs.get(Number(runId)); if (!run) return false;
    let hit = false;
    for (const it of run.items) if (it.dept === to && it.state === 'queued' && it.hold) {
      it.waitDocs.delete(from); hit = true;
      if (!it.waitDocs.size) it.hold = false;                       // đủ hồ sơ (chặng song song gộp thì phải đủ từng phòng)
    }
    if (hit) { assign(); broadcast(); }
    return hit;
  }
  // Cảnh 3D báo: người mượn agentId đã ngồi vào bàn mượn → bắt đầu tính tiến độ.
  function arrived(agentId) {
    let hit = false;
    for (const run of runs.values()) for (const it of run.items) if (it.state === 'working' && it.agentId === Number(agentId) && it.travel > 0) { it.travel = 0; hit = true; }
    if (hit) broadcast();
    return hit;
  }
  const viewerPing = () => { lastViewer = Date.now(); };

  function setSpeed(v) {
    if (!SPEEDS.includes(Number(v))) throw new SimError(400, `Tốc độ phải là một trong: ${SPEEDS.join(', ')}.`);
    speed = Number(v); q.setSetting.run('sim.speed', String(speed)); broadcast(); return speed;
  }
  function setAuto(on) {
    auto = !!on; q.setSetting.run('sim.auto', auto ? '1' : '0'); if (auto) nextAuto = 1; broadcast(); return auto;
  }
  function clear() {
    for (const run of runs.values()) {
      for (const item of run.items) {
        if (item.state === 'done') continue;
        if (item.agentId) { busy.delete(item.agentId); setAgent(item.agentId, 'idle'); }
        db.prepare("UPDATE work_items SET state = 'cancelled', finished_at = datetime('now') WHERE id = ?").run(item.id);
      }
      q.updRun.run('cancelled', run.stage, 'cancelled', run.id);
    }
    runs.clear(); broadcast();
  }

  return {
    spawn, tick, snapshot, setSpeed, setAuto, clear, delivered, arrived, viewerPing,
    start() {
      if (timer) return;
      lastMs = Date.now();
      timer = setInterval(() => { const n = Date.now(); const dt = Math.min(2, (n - lastMs) / 1000); lastMs = n; tick(dt); }, 1000);
      timer.unref();
    },
    stop() { clearInterval(timer); timer = null; }
  };
}
