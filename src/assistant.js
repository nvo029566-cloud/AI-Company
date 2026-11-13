import { SimError } from './sim.js';
import { strip, tokens } from './text.js';
import { round2, WARN_AT } from './pricing.js';

// Trợ lý: trả lời câu hỏi bằng tiếng Việt về công ty dựa trên DỮ LIỆU THẬT trong cơ sở dữ liệu.
// Hiện là bộ quy tắc (nhận ra ý định theo từ khoá), chưa phải AI. AI thật có từ giai đoạn 10.
export const MAX_QUESTION = 300;
export const EXAMPLES = ['Hôm nay tiêu bao nhiêu?', 'Phòng nào đang rảnh?', 'Có gì cần tôi duyệt không?', 'Dự án nào đang chạy?', 'Có lỗi nào chưa sửa?', 'Tháng này còn bao nhiêu ngân sách?'];
const STOP = new Set(['la', 'co', 'khong', 'cua', 'cho', 'toi', 'the', 'nao', 'gi', 'o', 'va', 'nhung', 'cac', 'mot', 'duoc', 'nay', 'kia', 'bao', 'nhieu', 'hay', 'cho', 'xem', 'noi', 've', 'trong', 'dang', 'da', 'se', 'bi']);

export function createAssistant({ db, projects, approvals, costs, work, bugs, knowledge, reports, notifier }) {
  const cur = '$';
  const money = n => `${cur}${round2(Number(n) || 0).toFixed(2)}`;
  const link = (label, href) => ({ label, href });
  const reply = (intent, answer, links = [], suggestions = EXAMPLES.slice(0, 3)) => ({ intent, answer, links, suggestions, source: 'rules' });
  const bullet = arr => arr.map(x => `- ${x}`).join('\n');

  const depts = () => db.prepare(`SELECT d.code, d.name, COUNT(a.id) AS total, COALESCE(SUM(a.status IN ('working','reviewing')), 0) AS working, COALESCE(SUM(a.status = 'blocked'), 0) AS blocked
    FROM departments d JOIN agents a ON a.dept_id = d.id WHERE d.code GLOB '[0-9]*' GROUP BY d.id ORDER BY d.sort`).all();

  // ---- nhận ra đối tượng được nhắc tới ----
  function findProject(n, qTokens) {
    let best = null;
    for (const p of projects.list(100)) {
      const title = strip(p.title), tt = tokens(p.title).filter(t => t.length >= 3 && !STOP.has(t));
      if (!tt.length) continue;
      const hits = tt.filter(t => qTokens.includes(t)).length, ratio = hits / tt.length;
      const score = n.includes(title) ? 2 + title.length / 100 : ((hits >= 3 || (hits >= 2 && ratio >= 0.6)) ? ratio : 0);
      if (score > 0 && (!best || score > best.score)) best = { p, score };
    }
    return best?.p || null;
  }
  function findAgent(n) {
    for (const a of db.prepare('SELECT a.id, a.name, a.title, a.status, d.name AS dept FROM agents a JOIN departments d ON d.id = a.dept_id').all()) {
      if (n.includes(strip(a.name))) return a;
    }
    return null;
  }
  function findDept(n) {
    for (const d of depts()) if (n.includes(`phong ${strip(d.name)}`) || n.includes(`phong ${d.code}`)) return d;
    return null;
  }

  // ---- trả lời ----
  function costToday() {
    const t = db.prepare("SELECT COALESCE(SUM(amount), 0) s, COUNT(*) n FROM costs WHERE date(created_at, 'localtime') = date('now', 'localtime')").get();
    if (!t.n) return reply('cost_today', 'Hôm nay chưa ghi nhận khoản chi phí nào.', [link('Mở Chi phí AI', '#/chi-phi-ai')]);
    const top = db.prepare(`SELECT COALESCE(p.title, 'Chạy thử') AS title, SUM(c.amount) AS s FROM costs c LEFT JOIN projects p ON p.id = c.project_id
      WHERE date(c.created_at, 'localtime') = date('now', 'localtime') GROUP BY c.project_id ORDER BY s DESC LIMIT 3`).all();
    return reply('cost_today', `Hôm nay đã ghi nhận ${money(t.s)} qua ${t.n} khoản (chi phí mô phỏng).\nNhiều nhất:\n${bullet(top.map(x => `${x.title}: ${money(x.s)}`))}`, [link('Mở Chi phí AI', '#/chi-phi-ai')]);
  }
  function costMonth() {
    const m = costs.monthStatus(), pct = Math.round(m.pct * 100);
    const note = m.level === 'over' ? ' Đã vượt ngân sách tháng.' : m.level === 'warn' ? ` Đã dùng hơn ${Math.round(WARN_AT * 100)}% ngân sách.` : '';
    return reply('cost_month', `Tháng này đã tiêu ${money(m.spent)} trên ngân sách ${money(m.budget)} (${pct}%), còn lại ${money(m.remaining)}.${note}\nChỉ tính tiền thật từ AI.${m.simulated ? ` Chi phí mô phỏng tháng này: ${money(m.simulated)} (không phải tiền thật).` : ''}`, [link('Mở Chi phí AI', '#/chi-phi-ai')]);
  }
  function idle() {
    const d = depts(), free = d.filter(x => x.working === 0);
    if (!free.length) return reply('idle', 'Hiện không có phòng nào rảnh, phòng nào cũng đang có người làm việc.', [link('Xem nhân sự', '#/nhan-su')]);
    return reply('idle', `Có ${free.length} trên ${d.length} phòng đang rảnh:\n${bullet(free.map(x => `${x.name} (${x.total} người)`))}`, [link('Xem nhân sự', '#/nhan-su')]);
  }
  function busy() {
    const rows = work.list({ state: 'working', limit: 12 });
    if (!rows.length) return reply('busy', 'Hiện không ai đang làm việc.', [link('Giao việc mới', '#/phong-dieu-hanh')]);
    return reply('busy', `Có ${rows.length} người đang làm việc:\n${bullet(rows.map(t => `${t.agentName || 'Chưa có người'} (${t.deptName}): ${t.demo ? t.title : t.title.split(': ')[0]}${t.projectTitle ? ` trong "${t.projectTitle}"` : ''}, ${Math.round(t.progress * 100)}%`))}`, [link('Xem công việc', '#/cong-viec')]);
  }
  function running() {
    const rs = projects.list(100).filter(p => p.status === 'running');
    if (!rs.length) return reply('running', 'Hiện không có dự án nào đang chạy.', [link('Giao việc mới', '#/phong-dieu-hanh')]);
    return reply('running', `Có ${rs.length} dự án đang chạy:\n${bullet(rs.map(p => `${p.title}: ${p.stats.tasksDone}/${p.stats.tasksTotal} việc, đã ghi nhận ${money(p.stats.spent)}${p.progress?.gate ? ', đang chờ bạn duyệt' : ''}`))}`, [link('Mở Dự án', '#/du-an')]);
  }
  function counts() {
    const c = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM projects GROUP BY status').all().map(r => [r.status, r.n]));
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    if (!total) return reply('counts', 'Chưa có dự án nào.', [link('Giao việc mới', '#/phong-dieu-hanh')]);
    return reply('counts', `Tổng ${total} dự án: ${c.done || 0} đã xong, ${c.running || 0} đang chạy, ${c.awaiting || 0} chờ duyệt, ${c.rejected || 0} bị từ chối, ${c.cancelled || 0} đã dừng.`, [link('Mở Dự án', '#/du-an')]);
  }
  function pending() {
    const items = approvals.list({ status: 'pending' });
    if (!items.length) return reply('approvals', 'Không có gì cần bạn duyệt lúc này.', [link('Mở Phê duyệt', '#/phe-duyet')]);
    return reply('approvals', `Có ${items.length} phiếu chờ bạn:\n${bullet(items.slice(0, 6).map(i => `${i.kindLabel}: ${i.title}`))}`, [link('Mở Phê duyệt', '#/phe-duyet')]);
  }
  function bugsAnswer() {
    const s = bugs.summary(), act = bugs.list({ status: 'active', limit: 6 });
    if (!s.total) return reply('bugs', 'Chưa có lỗi nào được ghi nhận.', [link('Mở trang Lỗi', '#/loi')]);
    if (!s.active) return reply('bugs', `Không có lỗi nào chưa đóng. Tổng cộng đã ghi nhận ${s.total} lỗi, ${s.closed} đã đóng.`, [link('Mở trang Lỗi', '#/loi')]);
    return reply('bugs', `Có ${s.active} lỗi chưa đóng (${s.open} chờ sửa, ${s.fixing} đang sửa, ${s.fixed} chờ kiểm lại):\n${bullet(act.map(b => `${b.title} (người làm ra lỗi: ${b.ownerName}, ${b.statusLabel.toLowerCase()})`))}`, [link('Mở trang Lỗi', '#/loi')]);
  }
  function deployments() {
    const d = reports.deployments().slice(0, 3);
    if (!d.length) return reply('deployments', 'Chưa có lần triển khai nào (bản mô phỏng).', [link('Mở Triển khai', '#/trien-khai')]);
    return reply('deployments', `Có ${reports.deployments().length} lần triển khai (mô phỏng). Gần nhất:\n${bullet(d.map(x => `${x.projectTitle}: ${x.artifact}, chi phí ${money(x.cost)}`))}`, [link('Mở Triển khai', '#/trien-khai')]);
  }
  function notif() {
    const n = notifier ? notifier.unreadCount() : 0, items = notifier ? notifier.list({ unread: true, limit: 3 }) : [];
    return reply('notifications', n ? `Bạn có ${n} thông báo chưa đọc. Mới nhất:\n${bullet(items.map(i => i.title))}` : 'Bạn không có thông báo nào chưa đọc.', [link('Xem thông báo', '#/thong-bao')]);
  }
  function knowledgeAnswer(n, qTokens) {
    const words = qTokens.filter(t => t.length >= 3 && !STOP.has(t) && !['quy', 'tac', 'kien', 'thuc', 'bai', 'hoc', 'ghi', 'chu'].includes(t));
    const found = words.length ? knowledge.list({ q: words.join(' '), limit: 3 }) : knowledge.list({ kind: 'rule', limit: 5 });
    if (!found.length) return reply('knowledge', 'Tôi không thấy mục kiến thức nào khớp. Bạn có thể thêm quy tắc hoặc ghi chú ở trang Kiến thức.', [link('Mở Kiến thức', '#/kien-thuc')]);
    return reply('knowledge', `${words.length ? 'Tìm thấy' : 'Các quy tắc dùng chung'}:\n${bullet(found.map(k => `${k.kindLabel}: ${k.title}${k.body ? ` — ${k.body.split('\n')[0].slice(0, 140)}` : ''}`))}`, [link('Mở Kiến thức', '#/kien-thuc')]);
  }
  function projectAnswer(p) {
    const d = projects.get(p.id), s = d.stats;
    const lines = [`Trạng thái: ${d.statusLabel}.`];
    if (d.status === 'awaiting') lines.push(`Ước tính chi phí ${money(d.estimate)}, đang chờ bạn duyệt kế hoạch.`);
    else if (d.status !== 'rejected') {
      lines.push(`Tiến độ: ${s.tasksDone}/${s.tasksTotal} việc xong.`, `Chi phí ghi nhận ${money(s.spent)} trên ngân sách ${money(d.budgetCap ?? d.estimate)}.`);
      if (s.bugs.total) lines.push(`Lỗi: ${s.bugs.total} tìm ra, ${s.bugs.active} chưa đóng.`);
      if (d.gate) lines.push(d.gate.kind === 'release' ? 'Đang chờ bạn cho phép phát hành.' : 'Đang chờ bạn duyệt chi phí vượt ngân sách.');
      else if (d.progress?.delivering) lines.push('Đang giao hồ sơ cuối cho CEO.');
      else if (d.progress?.bugRound) lines.push('Đang sửa lỗi do kiểm thử tìm ra.');
    }
    return reply('project', `"${d.title}"\n${bullet(lines)}`, [link('Mở dự án', `#/du-an/${d.id}`), link('Xem báo cáo', `#/bao-cao?duan=${d.id}`)]);
  }
  function agentAnswer(a) {
    const info = work.agentTasks(a.id), cur_ = info.current;
    const lines = [`${a.title}, phòng ${a.dept}.`, cur_ ? `Đang làm: ${cur_.demo ? cur_.title : cur_.title.split(': ')[0]}${cur_.projectTitle ? ` trong "${cur_.projectTitle}"` : ''} (${Math.round(cur_.progress * 100)}%).` : (a.status === 'blocked' ? 'Đang bị trả lỗi, chờ sửa.' : 'Đang rảnh.'), `Đã hoàn thành ${info.doneCount} việc.`];
    return reply('agent', `${a.name}\n${bullet(lines)}`, [link('Mở trang cá nhân', `#/nhan-su/${a.id}`)]);
  }
  function deptAnswer(d) {
    return reply('dept', `Phòng ${d.name}: ${d.working}/${d.total} người đang làm${d.blocked ? `, ${d.blocked} người đang bị trả lỗi` : ''}.`, [link('Xem nhân sự phòng này', `#/nhan-su?phong=${d.code}`)]);
  }
  function help() {
    return reply('help', 'Tôi trả lời được các câu hỏi về dữ liệu thật của công ty:\n' + bullet(['Chi phí: hôm nay, tháng này, còn bao nhiêu ngân sách', 'Ai đang làm gì, phòng nào đang rảnh', 'Dự án nào đang chạy, một dự án cụ thể đến đâu rồi', 'Có gì cần bạn duyệt, lỗi nào chưa sửa, đã triển khai gì', 'Quy tắc và bài học trong kho kiến thức']) + '\nTôi trả lời theo quy tắc, chưa phải AI. AI thật có từ giai đoạn 10.', [], EXAMPLES);
  }

  // Các ý định theo từ khoá (đã bỏ dấu). Điểm = tổng độ dài các cụm khớp; cùng điểm thì lấy cái đứng trước.
  const INTENTS = [
    ['cost_today', ['hom nay'], n => (n.includes('tieu') || n.includes('chi phi') || n.includes('tien') || n.includes('ton')), costToday],
    ['cost_month', ['thang nay', 'ngan sach', 'chi phi', 'tieu bao nhieu', 'con lai bao nhieu', 'het bao nhieu', 'ton bao nhieu'], null, costMonth],
    ['idle', ['dang ranh', 'phong nao ranh', 'ai ranh', 'ranh'], null, idle],
    ['busy', ['dang lam gi', 'ai dang lam', 'dang lam viec', 'phong nao ban', 'dang ban'], null, busy],
    ['running', ['du an nao dang chay', 'du an dang chay', 'dang chay', 'may du an dang'], null, running],
    ['counts', ['bao nhieu du an', 'da xong', 'hoan thanh', 'giao xong'], null, counts],
    ['approvals', ['can toi duyet', 'cho toi duyet', 'phe duyet', 'can duyet', 'cho duyet', 'duyet'], null, pending],
    ['bugs', ['chua sua', 'tra loi', 'bug', 'loi nao', 'co loi', 'loi'], null, bugsAnswer],
    ['deployments', ['trien khai', 'phat hanh', 'ban phat hanh', 'deploy'], null, deployments],
    ['notifications', ['thong bao'], null, notif],
    ['knowledge', ['quy tac', 'kien thuc', 'bai hoc', 'ghi chu', 'luu y'], null, null, 50],
    ['help', ['lam duoc gi', 'giup toi', 'huong dan', 'tro ly', 'giup'], null, help]
  ];
  function detect(n) {
    let best = null;
    for (const [name, phrases, need, fn, boost = 0] of INTENTS) {
      if (need && !need(n)) continue;
      let score = phrases.filter(p => new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(n)).reduce((a, p) => a + p.length, 0);
      if (score > 0 && need) score += 100;
      if (score > 0) score += boost;                                  // nhắc thẳng tới "quy tắc", "kiến thức" thì thắng các ý định chung như "phát hành"                          // ý định có điều kiện riêng (hôm nay + chi phí) thắng ý định chung
      if (score > 0 && (!best || score > best.score)) best = { name, fn, score };
    }
    return best;
  }

  function ask(question) {
    if (typeof question !== 'string') throw new SimError(400, 'Hãy gõ câu hỏi của bạn.');
    const q = question.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) throw new SimError(400, 'Hãy gõ câu hỏi của bạn.');
    if (q.length > MAX_QUESTION) throw new SimError(400, `Câu hỏi quá dài (tối đa ${MAX_QUESTION} ký tự).`);
    const n = strip(q), qTokens = tokens(q);
    if (/^(xin chao|chao|hello|hi|alo)\b/.test(n) && qTokens.length <= 4) return reply('greeting', 'Xin chào! Bạn muốn hỏi gì về công ty? Ví dụ như chi phí, ai đang làm gì, hoặc dự án đang chạy.', [], EXAMPLES);
    const proj = findProject(n, qTokens);
    if (proj) return projectAnswer(proj);
    const ag = findAgent(n);
    if (ag) return agentAnswer(ag);
    const dp = findDept(n);
    if (dp) return deptAnswer(dp);
    const hit = detect(n);
    if (hit) return hit.fn ? hit.fn() : knowledgeAnswer(n, qTokens);
    const words = qTokens.filter(t => t.length >= 3 && !STOP.has(t));
    if (words.length) { const found = knowledge.list({ q: words.join(' '), limit: 3 }); if (found.length) return knowledgeAnswer(n, qTokens); }
    return reply('unknown', 'Tôi chưa hiểu câu hỏi này. Tôi chỉ trả lời theo quy tắc về dữ liệu của công ty, chưa phải AI. Bạn thử hỏi một trong các câu dưới đây.', [], EXAMPLES);
  }

  return { ask };
}
