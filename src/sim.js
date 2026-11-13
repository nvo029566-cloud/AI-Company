// Bộ máy mô phỏng: tạo "lượt chạy" đi qua dây chuyền các phòng, để xem công ty vận hành.
// Giai đoạn 10 sẽ thay phần "làm việc" bằng agent AI thật, giữ nguyên cách điều phối và sự kiện.

import { COURIER_TITLES } from './seed.js';
import { BASE_COST, TOKEN_PRICE, MODEL_NAME, round2 } from './pricing.js';

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
// Lỗi mà phòng Kiểm thử có thể tìm ra, theo phòng của người làm ra nó.
export const BUG_BANK = {
  '06': ['Nút "Gửi" không bấm được trên điện thoại', 'Chữ bị cắt ở màn hình nhỏ', 'Màu chữ khó đọc ở chế độ tối', 'Ô nhập không báo lỗi khi để trống'],
  '07': ['Lưu dữ liệu bị trùng khi bấm hai lần', 'Báo lỗi 500 khi thiếu thông tin', 'Truy vấn chậm khi danh sách dài', 'Không kiểm tra quyền khi xem dữ liệu người khác'],
  '08': ['Ứng dụng đóng đột ngột khi xoay màn hình', 'Thông báo đẩy không hiện trên máy cũ', 'Mất dữ liệu khi mất mạng giữa chừng'],
  '09': ['Ảnh tải rất chậm trên 4G', 'Liên kết ở chân trang bị hỏng', 'Trang lệch bố cục trên màn hình rộng']
};
export const SEVERITIES = ['low', 'medium', 'high'];
function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Mượn người: khi một phòng đã hết người rảnh mà vẫn còn việc chờ, mượn một người đang rảnh ở phòng khác sang ngồi bàn trống.
// BORROW_CAP = số người mượn tối đa cùng lúc vào mỗi phòng (không vượt số bàn trống trong phòng; phòng 01 và 09 kín bàn nên không mượn được).
export const BORROW_CAP = { '02': 2, '03': 2, '05': 2, '06': 2, '07': 2, '08': 2, '10': 2, '11': 2, '12': 2 };
export const MAX_BORROWED = 4;               // toàn công ty cùng lúc, để văn phòng không bị xáo trộn
const SPEEDS = [1, 2, 4, 8];

export class SimError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createSim({ db, hub, config = {}, random = Math.random, hooks = {}, ai = null }) {
  // holdViewer / holdNoViewer: giây chờ dự phòng khi có / không có người đang xem cảnh 3D
  const cfg = { stageSeconds: [8, 18], autoDemo: false, maxAutoRuns: 3, borrowTravel: 14, holdViewer: 180, holdNoViewer: 4, bugRate: 0.35, maxBugRounds: 1, gates: true, costBias: 1, overrunStep: 0.25, ...(config.sim || {}) };
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
    setRunProject: db.prepare('UPDATE runs SET project_id = ? WHERE id = ?'),
    projDone: db.prepare("UPDATE projects SET status = 'done', finished_at = datetime('now') WHERE id = ? AND status = 'running'"),
    projCancel: db.prepare("UPDATE projects SET status = 'cancelled', finished_at = datetime('now') WHERE id = ? AND status = 'running'"),
    updRun: db.prepare("UPDATE runs SET state = ?, stage = ?, finished_at = CASE WHEN ? = 'running' THEN NULL ELSE datetime('now') END WHERE id = ?"),
    insItem: db.prepare('INSERT INTO work_items (run_id, stage, dept_id, title, support, duration, kind, bug_id) VALUES (?,?,?,?,?,?,?,?)'),
    insBug: db.prepare('INSERT INTO bugs (run_id, project_id, title, severity, owner_agent_id, owner_dept_id, found_by_agent_id) VALUES (?,?,?,?,?,?,?)'),
    setBugItem: db.prepare('UPDATE bugs SET work_item_id = ? WHERE id = ?'),
    bugFixing: db.prepare("UPDATE bugs SET status = 'fixing', fixing_at = datetime('now') WHERE id = ? AND status = 'open'"),
    bugFixed: db.prepare("UPDATE bugs SET status = 'fixed', fixed_at = datetime('now') WHERE id = ? AND status = 'fixing'"),
    bugClosed: db.prepare("UPDATE bugs SET status = 'closed', closed_at = datetime('now') WHERE id = ? AND status = 'fixed'"),
    setRunAi: db.prepare('UPDATE runs SET ai = 1 WHERE id = ?'),
    setProjAi: db.prepare('UPDATE projects SET ai = 1 WHERE id = ?'),
    insCost: db.prepare('INSERT INTO costs (run_id, project_id, work_item_id, agent_id, dept_id, kind, amount, tokens_in, tokens_out, model) VALUES (?,?,?,?,?,?,?,?,?,?)'),
    insApproval: db.prepare('INSERT INTO approvals (kind, project_id, run_id, title, detail) VALUES (?,?,?,?,?)'),
    setApproval: db.prepare("UPDATE approvals SET status = ?, decided_at = datetime('now') WHERE id = ? AND status = 'pending'"),
    cancelRunApprovals: db.prepare("UPDATE approvals SET status = 'cancelled', decided_at = datetime('now') WHERE run_id = ? AND status = 'pending'"),
    setProjBudget: db.prepare('UPDATE projects SET budget = ? WHERE id = ?'),
    insDeploy: db.prepare('INSERT INTO deployments (project_id, run_id, version, kind, artifact, approval_id, cost) VALUES (?,?,?,?,?,?,?)'),
    bugsCancelRun: db.prepare("UPDATE bugs SET status = 'cancelled', closed_at = datetime('now') WHERE run_id = ? AND status IN ('open','fixing','fixed')"),
    startItem: db.prepare("UPDATE work_items SET state = 'working', agent_id = ?, started_at = datetime('now') WHERE id = ?"),
    doneItem: db.prepare("UPDATE work_items SET state = 'done', progress = 1, finished_at = datetime('now') WHERE id = ?"),
    setStatus: db.prepare('UPDATE agents SET status = ? WHERE id = ?'),
    doneCount: db.prepare("SELECT COUNT(*) n FROM runs WHERE state = 'done'")
  };
  const setting = (k, d) => { const r = q.getSetting.get(k); return r ? r.value : d; };

  // Khởi động: các lượt demo dang dở không được chạy tiếp, trả mọi agent về trạng thái rảnh.
  const interrupted = db.prepare("SELECT id, title FROM projects WHERE status = 'running'").all();     // dự án bị ngắt vì tắt máy chủ: báo cho bạn biết
  db.exec(`UPDATE work_items SET state = 'cancelled', finished_at = datetime('now') WHERE state IN ('queued','working');
           UPDATE runs SET state = 'cancelled', finished_at = datetime('now') WHERE state = 'running';
           UPDATE projects SET status = 'cancelled', finished_at = datetime('now') WHERE status = 'running';
           UPDATE bugs SET status = 'cancelled', closed_at = datetime('now') WHERE status IN ('open','fixing','fixed');
           UPDATE approvals SET status = 'cancelled', decided_at = datetime('now') WHERE status = 'pending';
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
  // Móc ra ngoài (thông báo, bài học tự động). Lỗi ở đây không bao giờ được làm hỏng mô phỏng.
  const hook = (name, ...args) => { try { hooks[name]?.(...args); } catch (e) { console.error(`[móc ${name}]`, e.message); } };
  for (const p of interrupted) hook('push', { kind: 'stopped', level: 'warn', title: `Dự án bị dừng: ${p.title}`, body: 'Máy chủ đã tắt hoặc khởi động lại giữa chừng nên dự án không chạy tiếp được. Tiền đã tiêu vẫn được tính. Bạn có thể gửi lại yêu cầu.', link: `#/du-an/${p.id}`, projectId: p.id, dedupe: `stopped:${p.id}` });
  const duration = () => cfg.stageSeconds[0] + random() * (cfg.stageSeconds[1] - cfg.stageSeconds[0]);

  function setAgent(id, status) { statusOf.set(id, status); q.setStatus.run(status, id); }
  // Người làm ra lỗi chưa sửa: hiện "bị chặn" (đỏ) khi rảnh, và không nhận việc khác cho tới khi sửa xong lỗi của mình.
  const owed = new Map();            // agentId -> số lỗi đang chờ họ sửa
  const idleStatus = id => (owed.get(id) || 0) > 0 ? 'blocked' : 'idle';
  const owe = id => owed.set(id, (owed.get(id) || 0) + 1);
  const unowe = id => { const n = (owed.get(id) || 0) - 1; if (n > 0) owed.set(id, n); else owed.delete(id); };

  function addItems(run, stageIdx, fromCodes = []) {
    const codes = run.plan[stageIdx], holdFor = viewerAlive() ? cfg.holdViewer : cfg.holdNoViewer;
    for (const code of codes) {
      const item = { dept: code, stage: stageIdx, state: 'queued', progress: 0, duration: duration(), agentId: null, support: false, title: STAGE_LABEL[code],
        hold: fromCodes.length > 0, waitDocs: new Set(fromCodes), holdLeft: holdFor, holdReal: viewerAlive(), ai: !!run.ai };      // đang chờ hồ sơ của phòng trước chuyển tới; ai: việc do mô hình AI thật làm
      item.id = Number(q.insItem.run(run.id, stageIdx, idByCode.get(code), `${STAGE_LABEL[code]}: ${run.title}`, 0, item.duration, 'main', null).lastInsertRowid);
      run.items.push(item);
    }
    // Phòng Nghiên cứu thỉnh thoảng được gọi hỗ trợ ở chặng viết yêu cầu hoặc thiết kế; không chặn dây chuyền.
    if (['03', '05'].includes(codes[0]) && random() < 0.4) {
      const item = { dept: '04', stage: stageIdx, state: 'queued', progress: 0, duration: duration() * 0.7, agentId: null, support: true, title: STAGE_LABEL['04'] };
      item.id = Number(q.insItem.run(run.id, stageIdx, idByCode.get('04'), `${STAGE_LABEL['04']}: ${run.title}`, 1, item.duration, 'support', null).lastInsertRowid);
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
    const pool = [...homeOf.keys()].filter(id => !busy.has(id) && !reserved.has(id) && !leads.has(id) && !owed.has(id) && homeOf.get(id) !== dept && !queuedDepts.has(homeOf.get(id)));
    const rd = pool.filter(id => homeOf.get(id) === '04');         // phòng Nghiên cứu (10 người) cho mượn trước
    const from = rd.length ? rd : pool;
    return from.length ? from[Math.floor(random() * from.length)] : null;
  }

  function assign() {
    for (const run of runs.values()) {
      for (const item of run.items) {
        if (item.state !== 'queued' || item.hold) continue;
        let free, borrowed = false;
        if (item.owner != null) {                                  // việc sửa lỗi: chỉ đúng người làm ra lỗi mới nhận
          if (busy.has(item.owner)) continue;
          free = [item.owner]; borrowed = homeOf.get(item.owner) !== item.dept;
        } else {
          free = (agentsByCode.get(item.dept) || []).filter(id => !busy.has(id) && !reserved.has(id) && !owed.has(id));
          if (!free.length && !item.support) { const l = pickLender(item.dept); if (l != null) { free = [l]; borrowed = true; } }
          if (!free.length) continue;
        }
        const id = item.owner != null ? free[0] : free[Math.floor(random() * free.length)];
        busy.add(id);
        item.agentId = id; item.state = 'working'; item.borrowed = borrowed;
        item.travelReal = viewerAlive();                                                   // có người xem: chờ cảnh 3D báo đã tới bàn (arrived), dự phòng 180 giây thật
        item.travel = !borrowed ? 0 : (item.travelReal ? 180 : cfg.borrowTravel);           // không có người xem: tính theo giây mô phỏng
        q.startItem.run(id, item.id);
        setAgent(id, REVIEW_DEPTS.has(item.dept) ? 'reviewing' : 'working');
        if (item.fix) startFix(run, item);
      }
    }
  }

  // Chi phí mô phỏng của một việc: giá kế hoạch của phòng (hoặc giá cơ sở) × hệ số ngẫu nhiên 0,8–1,3 theo từng lượt chạy. Chưa phải chi phí thật.
  const ARTIFACT = { web: 'Bản web (mô phỏng)', exe: 'Bộ cài .exe (mô phỏng)', landing: 'Trang đích (mô phỏng)', mobile: 'Gói ứng dụng di động (mô phỏng)' };
  function recordCost(run, item, fraction = 1) {
    const kind = item.fix ? 'fix' : item.retest ? 'retest' : item.support ? 'support' : 'work';
    const base = item.fix ? (BASE_COST[item.dept] || 0.4) * 0.35 : item.retest ? BASE_COST['10'] * 0.3 : item.support ? BASE_COST['04'] : (run.planCosts?.[item.dept] ?? BASE_COST[item.dept] ?? 0.4);
    const rng = run.costRng || (run.costRng = mulberry32((Math.imul(run.id, 40503) + 17) >>> 0));
    const amount = round2(base * (0.8 + rng() * 0.5) * cfg.costBias * fraction);
    if (!(amount > 0)) return;
    const tokens = Math.round(amount / TOKEN_PRICE * 1000), tin = Math.round(tokens * 0.75);
    q.insCost.run(run.id, run.projectId, item.id ?? null, item.agentId ?? null, idByCode.get(item.dept), kind, amount, tin, tokens - tin, MODEL_NAME);
    run.spent = round2(run.spent + amount);
    emit('costs', { time: Date.now() });       // giao diện cập nhật ô chi phí tháng
    hook('costCheck');                         // cảnh báo khi chạm 80% và 100% ngân sách tháng
  }
  // Chi phí THẬT của một lời gọi AI (số token do nhà cung cấp báo). Số tiền có thể rất nhỏ nên làm tròn tới 6 chữ số thập phân.
  const round6 = n => Math.round(n * 1e6) / 1e6;
  function recordRealCost(run, item, u) {
    const kind = item.fix ? 'fix' : item.retest ? 'retest' : 'work';
    q.insCost.run(run.id, run.projectId, item.id ?? null, item.agentId ?? null, idByCode.get(item.dept), kind, u.amount, u.tokensIn, u.tokensOut, u.model);
    run.spent = round6(run.spent + u.amount);
    emit('costs', { time: Date.now() });
    hook('costCheck');
  }
  const isCore = i => !i.support && !i.fix && !i.retest;      // việc thuộc dây chuyền chính (không tính hỗ trợ, sửa lỗi, kiểm lại)
  const holdFor = () => viewerAlive() ? cfg.holdViewer : cfg.holdNoViewer;
  const bugsEvent = () => emit('bugs', { time: Date.now() });

  function finishItem(run, item) {
    item.state = 'done'; item.progress = 1;
    q.doneItem.run(item.id);
    if (!run.ai) recordCost(run, item);          // lượt AI thật đã ghi chi phí thật sau từng lời gọi
    if (item.aiResult?.written?.length) emit('files', { projectId: run.projectId, time: Date.now() });
    busy.delete(item.agentId); setAgent(item.agentId, idleStatus(item.agentId));
    if (item.support) return;
    if (item.fix) return finishFix(run, item);
    const stageItems = run.items.filter(i => i.stage === item.stage && isCore(i));
    if (!stageItems.every(i => i.state === 'done')) return;
    if (!item.retest && maybeBugRound(run, item)) return;       // kiểm thử tìm ra lỗi: dây chuyền dừng lại để sửa
    if (item.retest) {
      closeBugs(run);
      const left = item.aiResult?.allFindings?.length || 0;
      if (run.ai && left && maybeBugRound(run, item)) return;           // kiểm lại vẫn còn lỗi và còn vòng sửa: quay lại sửa tiếp
      if (run.ai && left && run.projectId != null) hook('push', { kind: 'bug', level: 'warn', title: `Kiểm lại vẫn còn ${left} vấn đề: ${run.title}`, body: 'Xem docs/10-bao-cao-kiem-thu-lai.md trong thư mục sản phẩm.', link: `#/du-an/${run.projectId}`, projectId: run.projectId, dedupe: `retest:${run.id}` });
    }
    advance(run, item, stageItems);
  }

  // Sang chặng kế tiếp, hoặc (hết chặng cuối) giao hồ sơ hoàn thành cho CEO. Dự án thật có thể dừng lại ở "cổng phê duyệt" chờ bạn.
  function advance(run, item, stageItems) {
    const from = run.plan[item.stage];
    const sender = Object.fromEntries(stageItems.map(i => [i.dept, i.agentId]));   // ai vừa làm xong ở từng phòng: để giao diện cho họ cầm hồ sơ đi giao
    if (item.retest) sender[item.dept] = item.agentId;                           // sau khi kiểm lại, người kiểm lại cầm hồ sơ đi tiếp
    run.cont = { stageIdx: item.stage, from, sender };
    continueRun(run);
  }
  function gateKind(run, stageIdx) {
    if (!cfg.gates || run.projectId == null) return null;          // việc chạy thử không qua duyệt
    const next = run.plan[stageIdx + 1];
    if (!next) return null;
    if (run.budget != null && run.spent > run.budget + 1e-9) return 'overrun';
    if (next.includes('12') && !run.released) return 'release';     // trước chặng triển khai
    return null;
  }
  function openGate(run, kind) {
    const next = run.plan[run.cont.stageIdx + 1].map(c => STAGE_LABEL[c]);
    const core = run.items.filter(isCore);
    const detail = { spent: run.spent, budget: run.budget, estimate: run.estimate, tasksDone: core.filter(i => i.state === 'done').length, tasksTotal: run.plan.flat().length, next };
    let title;
    if (kind === 'overrun') { detail.raiseBy = round2(Math.max(0.5, run.estimate * cfg.overrunStep)); title = `Chi phí vượt ngân sách: ${run.title}`; }
    else { detail.bugsTotal = (run.bugs || []).length; detail.bugsClosed = (run.bugs || []).filter(b => b.status === 'closed').length; detail.artifact = run.ai ? 'Mã nguồn do AI viết' : ARTIFACT[run.kind]; title = `Cho phép phát hành: ${run.title}`; }
    const id = Number(q.insApproval.run(kind, run.projectId, run.id, title, JSON.stringify(detail)).lastInsertRowid);
    run.gate = { kind, approvalId: id };
    hook('push', { kind: 'approval', level: 'warn', title: title, body: kind === 'overrun' ? `Đã tiêu ${detail.spent} trên ngân sách ${detail.budget}. Dự án dừng chờ bạn quyết định.` : 'Dự án đã xong các chặng chính và dừng trước bước triển khai.', link: '#/phe-duyet', projectId: run.projectId, dedupe: `gate:${id}` });
    emit('approvals', { time: Date.now() }); broadcast();
  }
  function continueRun(run) {
    const { stageIdx, from, sender } = run.cont;
    const kind = gateKind(run, stageIdx);
    if (kind) { openGate(run, kind); return; }
    run.cont = null;
    run.stage = stageIdx + 1;
    if (run.stage < run.plan.length) {
      addItems(run, run.stage, from);
      q.updRun.run('running', run.stage, 'running', run.id);
      for (const f of from) for (const t of run.plan[run.stage]) emit('handoff', { runId: run.id, from: f, to: t, title: run.title, agentId: sender[f] ?? null });
    } else {
      // Hết chặng cuối: dự án chỉ "xong" khi CEO thật sự nhận hồ sơ (cảnh 3D báo qua delivered). Không có ai xem thì tự xong sau holdNoViewer giây mô phỏng.
      run.final = { waiting: new Set(from), left: holdFor(), real: viewerAlive() };
      for (const f of from) emit('handoff', { runId: run.id, from: f, to: 'CEO', title: run.title, delivered: true, agentId: sender[f] ?? null });
    }
  }
  // Bạn quyết định một cổng: duyệt thì chạy tiếp (chi phí vượt thì nâng ngân sách), từ chối thì dừng dự án.
  function resolveGate(approvalId, approve) {
    const run = [...runs.values()].find(r => r.gate?.approvalId === Number(approvalId));
    if (!run) return false;
    const { kind } = run.gate;
    q.setApproval.run(approve ? 'approved' : 'rejected', Number(approvalId));
    if (!approve) { cancelRun(run); emit('approvals', { time: Date.now() }); emit('projects', { time: Date.now() }); bugsEvent(); broadcast(); return true; }
    if (kind === 'overrun') {
      const raise = JSON.parse(db.prepare('SELECT detail FROM approvals WHERE id = ?').get(Number(approvalId)).detail).raiseBy;
      run.budget = round2(Math.max(run.budget, run.spent) + raise);                  // một lần duyệt là đủ vượt qua mức đã tiêu
      q.setProjBudget.run(run.budget, run.projectId);
    } else { run.released = true; run.releaseApprovalId = Number(approvalId); }
    run.gate = null;
    emit('approvals', { time: Date.now() });
    continueRun(run);
    broadcast();
    return true;
  }
  function completeRun(run) {
    run.state = 'done'; run.final = null;
    q.updRun.run('done', run.plan.length, 'done', run.id);
    if (run.projectId != null) {
      q.projDone.run(run.projectId);
      const nFiles = run.ai ? db.prepare('SELECT COUNT(*) n FROM project_files WHERE project_id = ?').get(run.projectId).n : 0;
      q.insDeploy.run(run.projectId, run.id, '1.0.0', run.kind, run.ai ? `Mã nguồn do AI viết (${nFiles} tệp) trong data/projects/${run.projectId}` : (ARTIFACT[run.kind] || 'Bản phát hành (mô phỏng)'), run.releaseApprovalId ?? null, run.spent);
      emit('projects', { time: Date.now() }); emit('deployments', { time: Date.now() });
      hook('push', { kind: 'finished', level: 'ok', title: `Đã giao xong: ${run.title}`, body: `Chi phí ghi nhận ${run.spent}. Bản phát hành mô phỏng đã được ghi lại.`, link: `#/du-an/${run.projectId}`, projectId: run.projectId, dedupe: `finished:${run.id}` });
      hook('projectDone', run.projectId);
    }
    emit('finished', { runId: run.id, projectId: run.projectId, title: run.title });
    runs.delete(run.id);
  }

  // Phòng Kiểm thử vừa chạy xong: có thể tìm ra lỗi của người ở chặng lập trình ngay trước đó. Mỗi lượt chạy chỉ có tối đa maxBugRounds đợt lỗi nên luôn kết thúc.
  // Dùng bộ số ngẫu nhiên riêng theo mã lượt chạy, không làm lệch dãy ngẫu nhiên chính của mô phỏng.
  // Kiểm thử xong: có lỗi thì dây chuyền dừng lại để sửa. Lượt mô phỏng lấy lỗi từ danh sách có sẵn; lượt AI thật lấy lỗi do kiểm tra tĩnh và AI rà soát tìm ra.
  function maybeBugRound(run, testItem) {
    const maxRounds = run.ai ? (config.ai?.bugRounds ?? 1) : cfg.maxBugRounds;
    if (testItem.dept !== '10' || (run.bugRounds || 0) >= maxRounds) return false;
    let plan = [];
    if (run.ai) {
      const devs = run.items.filter(i => i.stage < testItem.stage && isCore(i) && i.agentId != null && i.dept !== '10');
      for (const f of (testItem.aiResult?.findings || []).slice(0, 3)) {
        const dev = devs.find(d => d.dept === f.dept) || devs.find(d => ['06', '07', '08', '09'].includes(d.dept));
        if (dev) plan.push({ dev, title: f.title, severity: f.severity, detail: f.detail, file: f.file });
      }
    } else {
      if (!(cfg.bugRate > 0)) return false;
      const devs = run.items.filter(i => i.stage === testItem.stage - 1 && isCore(i) && i.agentId != null && BUG_BANK[i.dept]);
      if (!devs.length) return false;
      const rng = run.bugRng || (run.bugRng = mulberry32(Math.imul(run.id, 2654435761) >>> 0));
      if (!(rng() < cfg.bugRate)) return false;
      const pool = [...devs], n = pool.length > 1 && rng() < 0.3 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const dev = pool.splice(Math.floor(rng() * pool.length), 1)[0], bank = BUG_BANK[dev.dept];
        plan.push({ dev, title: bank[Math.floor(rng() * bank.length)], severity: SEVERITIES[Math.floor(rng() * SEVERITIES.length)] });
      }
    }
    if (!plan.length) return false;
    run.bugRounds = (run.bugRounds || 0) + 1; run.bugs = run.bugs || [];
    for (const { dev, title, severity, detail, file } of plan) {
      const bugId = Number(q.insBug.run(run.id, run.projectId, title, severity, dev.agentId, idByCode.get(dev.dept), testItem.agentId).lastInsertRowid);
      const fix = { dept: dev.dept, stage: testItem.stage, state: 'queued', progress: 0, duration: duration() * 0.6, agentId: null, support: false, fix: true, bugId, owner: dev.agentId, ai: !!run.ai,
        title: `Sửa lỗi: ${title}`, hold: true, waitDocs: new Set(['10']), holdLeft: holdFor(), holdReal: viewerAlive() };    // chờ báo cáo lỗi được mang tới tận tay
      fix.id = Number(q.insItem.run(run.id, testItem.stage, idByCode.get(dev.dept), fix.title, 0, fix.duration, 'fix', bugId).lastInsertRowid);
      q.setBugItem.run(fix.id, bugId);
      run.items.push(fix); run.bugs.push({ id: bugId, title, severity, detail: detail || '', file: file || null, status: 'open', ownerId: dev.agentId, ownerDept: dev.dept, itemId: fix.id });
      owe(dev.agentId); if (!busy.has(dev.agentId)) setAgent(dev.agentId, 'blocked');         // đánh dấu đỏ: bị trả lỗi
      emit('handoff', { runId: run.id, from: '10', to: dev.dept, title: run.title, agentId: testItem.agentId ?? null, toAgentId: dev.agentId, bug: true, bugId, bugTitle: title });
    }
    const n = plan.length;
    q.updRun.run('running', run.stage, 'running', run.id);
    bugsEvent();
    if (run.projectId != null) hook('push', { kind: 'bug', level: 'warn', title: `Kiểm thử tìm ra ${n} lỗi: ${run.title}`, body: run.bugs.slice(-n).map(b => b.title).join('; '), link: '#/loi', projectId: run.projectId, dedupe: `bugs:${run.id}:${run.bugRounds}` });
    return true;
  }
  function startFix(run, item) {              // người làm ra lỗi bắt đầu sửa: hết bị chặn
    unowe(item.owner);
    const bug = run.bugs?.find(b => b.id === item.bugId);
    if (bug) { bug.status = 'fixing'; q.bugFixing.run(bug.id); }
    bugsEvent();
  }
  function finishFix(run, item) {
    const bug = run.bugs?.find(b => b.id === item.bugId);
    if (bug) { bug.status = 'fixed'; q.bugFixed.run(bug.id); }
    bugsEvent();
    const fixes = run.items.filter(i => i.fix);
    if (!fixes.every(i => i.state === 'done')) return;
    const from = [...new Set(fixes.map(i => i.dept))];       // sửa xong hết: trả bản sửa về phòng Kiểm thử để kiểm lại
    const re = { dept: '10', stage: item.stage, state: 'queued', progress: 0, duration: duration() * 0.5, agentId: null, support: false, retest: true,
      title: 'Kiểm thử lại sau khi sửa lỗi', ai: !!run.ai, hold: true, waitDocs: new Set(from), holdLeft: holdFor(), holdReal: viewerAlive() };
    re.id = Number(q.insItem.run(run.id, item.stage, idByCode.get('10'), re.title, 0, re.duration, 'retest', null).lastInsertRowid);
    run.items.push(re);
    for (const f of fixes) emit('handoff', { runId: run.id, from: f.dept, to: '10', title: run.title, agentId: f.agentId ?? null, fixed: true, bugId: f.bugId });
  }
  function closeBugs(run) {
    for (const b of run.bugs || []) if (b.status === 'fixed') { b.status = 'closed'; q.bugClosed.run(b.id); }
    bugsEvent();
  }

  function spawn({ title, kind, projectId, planCosts, estimate, budget, ai: wantAi = false } = {}) {
    if (runs.size >= MAX_ACTIVE_RUNS) throw new SimError(409, `Đang có ${runs.size} việc chạy cùng lúc, hãy đợi bớt rồi thử lại.`);
    const k = kind || 'web';
    if (!PLANS[k]) throw new SimError(400, 'Loại sản phẩm không hợp lệ.');
    const t = (title == null || String(title).trim() === '') ? DEMO_TITLES[Math.floor(random() * DEMO_TITLES.length)] : String(title).trim().slice(0, 80);
    const run = { id: Number(q.insRun.run(t, k).lastInsertRowid), title: t, kind: k, plan: PLANS[k], stage: 0, state: 'running', items: [], projectId: Number.isInteger(projectId) ? projectId : null, bugRounds: 0, bugs: [], final: null,
      ai: !!(wantAi && ai && Number.isInteger(projectId) && ai.enabled()), planCosts: planCosts || null, estimate: Number(estimate) || 0, budget: budget == null ? null : Number(budget), spent: 0, released: false, gate: null, cont: null };
    if (run.projectId != null) q.setRunProject.run(run.projectId, run.id);
    if (run.ai) { q.setRunAi.run(run.id); q.setProjAi.run(run.projectId); }
    runs.set(run.id, run);
    addItems(run, 0, ['CEO']);
    for (const to of run.plan[0]) emit('handoff', { runId: run.id, from: 'CEO', to, title: t });
    assign();
    broadcast();
    return summary(run);
  }

  // ---- việc do AI thật làm ----
  function kindOf(item) { return item.fix ? 'fix' : item.retest ? 'retest' : 'work'; }
  function startAi(run, item) {
    item.aiState = 'running'; item.aiElapsed = 0; item.abort = new AbortController();
    const bug = item.fix ? run.bugs?.find(b => b.id === item.bugId) : null;
    const job = { runId: run.id, projectId: run.projectId, dept: item.dept, itemId: item.id, kind: kindOf(item), productKind: run.kind, signal: item.abort.signal,
      bug: bug ? { title: bug.title, detail: bug.detail, file: bug.file } : null,
      priorBugs: item.retest ? (run.bugs || []).filter(b => b.status === 'fixed').map(b => ({ title: b.title, detail: b.detail, file: b.file })) : [], onUsage: u => recordRealCost(run, item, u) };
    ai.execute(job).then(res => { if (item.state === 'working' && runs.has(run.id)) { item.aiResult = res; item.aiState = 'done'; } },
      err => { if (item.state === 'working' && runs.has(run.id)) { item.aiState = 'failed'; item.aiError = err; } });
  }
  function tickAi(run, item, dtSeconds) {
    if (!item.aiState) startAi(run, item);
    if (item.aiState === 'done') return finishItem(run, item);
    if (item.aiState === 'failed') return failAi(run, item);
    item.aiElapsed += dtSeconds;
    item.progress = 0.9 * (1 - Math.exp(-item.aiElapsed / 30));      // chưa biết khi nào xong: tiến dần tới 90%, hoàn tất khi mô hình trả lời
  }
  // Một lời gọi AI hỏng hẳn (hết lần thử lại, khoá sai, chạm giới hạn...): dừng cả dự án, giữ nguyên tiền đã tiêu, báo rõ nguyên nhân.
  function failAi(run, item) {
    const msg = String(item.aiError?.message || 'Lỗi không rõ').slice(0, 300);
    const projectId = run.projectId, title = run.title;
    cancelRun(run);
    if (projectId != null) hook('push', { kind: 'stopped', level: 'bad', title: `Dự án dừng vì lỗi AI: ${title}`, body: `${STAGE_LABEL[item.dept]}: ${msg}`, link: `#/du-an/${projectId}`, projectId, dedupe: `aifail:${run.id}` });
    emit('projects', { time: Date.now() }); emit('approvals', { time: Date.now() }); bugsEvent(); broadcast();
  }
  // Tắt AI giữa chừng: mọi dự án đang dùng AI thật bị dừng (việc chạy thử không bị ảnh hưởng).
  function cancelAiRuns(reason = 'AI đã bị tắt.') {
    for (const run of [...runs.values()]) {
      if (!run.ai) continue;
      const projectId = run.projectId, title = run.title;
      cancelRun(run);
      if (projectId != null) hook('push', { kind: 'stopped', level: 'warn', title: `Dự án bị dừng: ${title}`, body: reason, link: `#/du-an/${projectId}`, projectId, dedupe: `aioff:${run.id}` });
    }
    emit('projects', { time: Date.now() }); emit('approvals', { time: Date.now() }); bugsEvent(); broadcast();
  }

  function tick(dtSeconds) {
    const dt = dtSeconds * speed;
    for (const run of runs.values()) for (const it of run.items) {     // hết thời gian chờ dự phòng thì thả việc đang chờ hồ sơ
      if (it.state === 'queued' && it.hold && (it.holdLeft -= it.holdReal ? dtSeconds : dt) <= 0) it.hold = false;   // có người xem: tính giây thật; không có: tính giây mô phỏng nên tốc độ 4x/8x vẫn nhanh
    }
    assign();
    for (const run of [...runs.values()]) {
      if (run.final && (run.final.left -= run.final.real ? dtSeconds : dt) <= 0) { completeRun(run); continue; }     // hồ sơ cuối mãi không tới được CEO: tự xong để không kẹt
      for (const item of [...run.items]) {
        if (item.state !== 'working') continue;
        if (item.travel > 0) { item.travel = Math.max(0, item.travel - (item.travelReal ? dtSeconds : dt)); continue; }     // người mượn còn đang đi sang phòng này
        if (item.ai) { tickAi(run, item, dtSeconds); continue; }
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
      id: run.id, projectId: run.projectId ?? null, title: run.title, kind: run.kind, kindLabel: KIND_LABEL[run.kind], stage: run.stage, total: run.plan.length,
      ai: !!run.ai, delivering: !!run.final, gate: run.gate ? { kind: run.gate.kind, approvalId: run.gate.approvalId } : null, spent: run.spent, budget: run.budget, stages: run.plan.map((codes, i) => ({ depts: codes, state: i < run.stage ? 'done' : (i === run.stage ? 'current' : 'todo') })),
      items: run.items.filter(i => i.state !== 'done').map(i => ({ id: i.id, dept: i.dept, state: i.state, progress: Number(i.progress.toFixed(3)), title: i.title, agentId: i.agentId, support: i.support, kind: i.fix ? 'fix' : (i.retest ? 'retest' : (i.support ? 'support' : 'main')), bugId: i.bugId ?? null, inTransit: !!i.hold,
        borrowed: !!i.borrowed, from: i.borrowed ? homeOf.get(i.agentId) : null, travelling: (i.travel || 0) > 0 }))
    };
  }
  function snapshot() {
    const working = {};
    for (const [id, st] of statusOf) if (st === 'working' || st === 'reviewing') working[id] = st;       // người bị trả lỗi (blocked) không tính là đang làm
    const deptRows = depts.map(d => ({ code: d.code, total: (agentsByCode.get(d.code) || []).length,
      working: (agentsByCode.get(d.code) || []).filter(id => ['working', 'reviewing'].includes(statusOf.get(id))).length,
      blocked: (agentsByCode.get(d.code) || []).filter(id => statusOf.get(id) === 'blocked').length }));
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
  function delivered(runId, from, to, bugId = null) {
    const run = runs.get(Number(runId)); if (!run) return false;
    if (run.final && to === 'CEO') {                                // hồ sơ cuối đã tới tay CEO: dự án mới thật sự xong
      const hit = run.final.waiting.delete(from);
      if (hit && !run.final.waiting.size) { completeRun(run); broadcast(); }
      return hit;
    }
    let hit = false;
    for (const it of run.items) if (it.dept === to && it.state === 'queued' && it.hold && (bugId == null || !it.fix || it.bugId === Number(bugId))) {
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
  // Dừng một lượt chạy: việc đang làm dở vẫn tính phần tiền đã tiêu, việc chưa xong bị huỷ, lỗi và phê duyệt đang chờ bị huỷ.
  function cancelRun(run) {
    for (const item of run.items) {
      if (item.state === 'done') continue;
      item.abort?.abort();
      if (item.state === 'working' && !run.ai && !(item.travel > 0) && item.progress > 0.02) recordCost(run, item, item.progress);
      if (item.agentId) { busy.delete(item.agentId); setAgent(item.agentId, 'idle'); }
      db.prepare("UPDATE work_items SET state = 'cancelled', finished_at = datetime('now') WHERE id = ?").run(item.id);
    }
    for (const b of run.bugs || []) if (b.status === 'open') { unowe(b.ownerId); if (!busy.has(b.ownerId)) setAgent(b.ownerId, 'idle'); }
    q.bugsCancelRun.run(run.id);
    q.cancelRunApprovals.run(run.id);
    q.updRun.run('cancelled', run.stage, 'cancelled', run.id);
    if (run.projectId != null) q.projCancel.run(run.projectId);
    runs.delete(run.id);
  }
  function clear() {
    const hadProjects = [...runs.values()].some(r => r.projectId != null);
    const hadGates = [...runs.values()].some(r => r.gate);
    for (const run of [...runs.values()]) cancelRun(run);
    broadcast(); bugsEvent();
    if (hadProjects) emit('projects', { time: Date.now() });
    if (hadGates) emit('approvals', { time: Date.now() });
  }

  // Đổi tỷ lệ lỗi và cổng phê duyệt khi đang chạy: chỉ ảnh hưởng các việc từ giờ trở đi.
  function setConfig({ bugRate, gates } = {}) {
    if (bugRate !== undefined) { if (!(typeof bugRate === 'number' && bugRate >= 0 && bugRate <= 1)) throw new SimError(400, 'Tỷ lệ lỗi phải từ 0 đến 1.'); cfg.bugRate = bugRate; }
    if (gates !== undefined) { if (typeof gates !== 'boolean') throw new SimError(400, 'Cổng phê duyệt chỉ có thể bật hoặc tắt.'); cfg.gates = gates; }
  }

  return {
    spawn, tick, snapshot, setSpeed, setAuto, clear, delivered, arrived, viewerPing, resolveGate, setConfig, cancelAiRuns,
    start() {
      if (timer) return;
      lastMs = Date.now();
      timer = setInterval(() => { const n = Date.now(); const dt = Math.min(2, (n - lastMs) / 1000); lastMs = n; tick(dt); }, 1000);
      timer.unref();
    },
    stop() { clearInterval(timer); timer = null; }
  };
}
