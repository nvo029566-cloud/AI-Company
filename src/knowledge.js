import { SimError, KIND_LABEL as PROJECT_KIND } from './sim.js';
import { strip, tokens } from './text.js';
import { round2 } from './pricing.js';

// Kho kiến thức của công ty: quy tắc dùng chung, ghi chú của bạn, và bài học tự sinh ra mỗi khi một dự án xong.
// Từ giai đoạn 10, các quy tắc sẽ được đưa vào chỉ dẫn của agent.
export const KIND_LABEL = { rule: 'Quy tắc', note: 'Ghi chú', lesson: 'Bài học' };
const MAX_BODY = 4000, MAX_TAGS = 8, MAX_LIMIT = 200;
const TAG_RE = /^[\p{L}\p{N} -]{1,24}$/u;

// Cách tránh từng lỗi mà phòng Kiểm thử có thể tìm ra: nội dung của bài học tự động.
export const BUG_TIPS = {
  'Nút "Gửi" không bấm được trên điện thoại': 'Kiểm tra vùng bấm tối thiểu 44 px và thử trên màn hình cảm ứng thật.',
  'Chữ bị cắt ở màn hình nhỏ': 'Dùng đơn vị tương đối, cho phép xuống dòng, thử ở chiều rộng 360 px.',
  'Màu chữ khó đọc ở chế độ tối': 'Định nghĩa màu theo biến và kiểm tra độ tương phản ở cả hai giao diện sáng và tối.',
  'Ô nhập không báo lỗi khi để trống': 'Báo rõ trường nào thiếu ngay cạnh ô nhập, không chỉ chặn nút gửi.',
  'Lưu dữ liệu bị trùng khi bấm hai lần': 'Khoá nút sau lần bấm đầu và kiểm tra trùng ở máy chủ (khoá duy nhất hoặc mã yêu cầu).',
  'Báo lỗi 500 khi thiếu thông tin': 'Kiểm tra đầu vào và trả lỗi 400 kèm thông báo dễ hiểu, không để máy chủ sập.',
  'Truy vấn chậm khi danh sách dài': 'Thêm chỉ mục, phân trang và đo thời gian với dữ liệu lớn trước khi bàn giao.',
  'Không kiểm tra quyền khi xem dữ liệu người khác': 'Mọi thao tác đọc và ghi đều phải kiểm tra người dùng có quyền với dữ liệu đó, ở máy chủ.',
  'Ứng dụng đóng đột ngột khi xoay màn hình': 'Lưu và khôi phục trạng thái khi màn hình xoay, thử cả hai chiều.',
  'Thông báo đẩy không hiện trên máy cũ': 'Kiểm tra quyền thông báo và thử trên phiên bản hệ điều hành thấp nhất được hỗ trợ.',
  'Mất dữ liệu khi mất mạng giữa chừng': 'Lưu tạm trên máy và gửi lại khi có mạng, không xoá dữ liệu cho tới khi máy chủ xác nhận.',
  'Ảnh tải rất chậm trên 4G': 'Nén ảnh, dùng kích thước phù hợp từng màn hình và tải lười.',
  'Liên kết ở chân trang bị hỏng': 'Chạy bộ kiểm tra liên kết trước khi phát hành.',
  'Trang lệch bố cục trên màn hình rộng': 'Giới hạn chiều rộng nội dung và thử ở màn hình từ 1920 px trở lên.'
};

const normTag = t => String(t).replace(/\s+/g, ' ').trim().toLowerCase();

export function createKnowledge({ db }) {
  const sel = `SELECT k.*, p.title AS projectTitle FROM knowledge k LEFT JOIN projects p ON p.id = k.project_id`;
  const shape = r => ({
    id: r.id, kind: r.kind, kindLabel: KIND_LABEL[r.kind], title: r.title, body: r.body, tags: r.tags ? r.tags.split(',') : [], source: r.source,
    projectId: r.project_id, projectTitle: r.projectTitle || null, pinned: !!r.pinned, createdAt: r.created_at, updatedAt: r.updated_at
  });
  const searchOf = (title, body, tags) => strip(`${title} ${body} ${tags.join(' ')}`);

  function validate(input, { partial = false, base = null } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SimError(400, 'Cần gửi nội dung ghi chú.');
    const out = { kind: base?.kind ?? 'note', title: base?.title ?? '', body: base?.body ?? '', tags: base ? (base.tags ? base.tags.split(',') : []) : [], pinned: base ? !!base.pinned : false };
    const has = k => Object.hasOwn(input, k);
    if (!partial || has('kind')) { if (!Object.hasOwn(KIND_LABEL, input.kind ?? (partial ? out.kind : 'note'))) throw new SimError(400, 'Loại phải là quy tắc, ghi chú hoặc bài học.'); out.kind = input.kind ?? out.kind; }
    if (!partial || has('title')) {
      if (typeof input.title !== 'string') throw new SimError(400, 'Cần có tiêu đề.');
      const t = input.title.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
      if (t.length < 1 || t.length > 120) throw new SimError(400, 'Tiêu đề dài từ 1 đến 120 ký tự.');
      out.title = t;
    }
    if (has('body')) {
      if (typeof input.body !== 'string') throw new SimError(400, 'Nội dung phải là chữ.');
      const b = input.body.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
      if (b.length > MAX_BODY) throw new SimError(400, `Nội dung tối đa ${MAX_BODY} ký tự.`);
      out.body = b;
    }
    if (has('tags')) {
      if (!Array.isArray(input.tags) || input.tags.length > MAX_TAGS) throw new SimError(400, `Nhãn tối đa ${MAX_TAGS} cái.`);
      const seen = new Set();
      for (const raw of input.tags) {
        if (typeof raw !== 'string') throw new SimError(400, 'Nhãn phải là chữ.');
        const t = normTag(raw);
        if (!TAG_RE.test(t)) throw new SimError(400, 'Nhãn dài 1 đến 24 ký tự, chỉ gồm chữ, số, khoảng trắng và dấu gạch ngang.');
        seen.add(t);
      }
      out.tags = [...seen];
    }
    if (has('pinned')) { if (typeof input.pinned !== 'boolean') throw new SimError(400, 'Ghim chỉ có thể bật hoặc tắt.'); out.pinned = input.pinned; }
    return out;
  }

  function list(f = {}) {
    const where = [], args = [];
    const toks = tokens(f.q || '');
    if (toks.length > 8) throw new SimError(400, 'Từ khoá tìm kiếm quá dài.');
    for (const t of toks) { where.push("k.search LIKE ? ESCAPE '\\'"); args.push(`%${t.replace(/[\\%_]/g, m => '\\' + m)}%`); }
    if (f.kind) { if (!Object.hasOwn(KIND_LABEL, f.kind)) throw new SimError(400, 'Loại không hợp lệ.'); where.push('k.kind = ?'); args.push(f.kind); }
    if (f.tag) { const t = normTag(f.tag); where.push("(',' || k.tags || ',') LIKE ? ESCAPE '\\'"); args.push(`%,${t.replace(/[\\%_]/g, m => '\\' + m)},%`); }
    if (f.source) { if (!['manual', 'auto', 'seed'].includes(f.source)) throw new SimError(400, 'Nguồn không hợp lệ.'); where.push('k.source = ?'); args.push(f.source); }
    let limit = f.limit == null || f.limit === '' ? 100 : Number(f.limit);
    if (!Number.isInteger(limit) || limit < 1) throw new SimError(400, 'Số dòng không hợp lệ.');
    limit = Math.min(MAX_LIMIT, limit);
    return db.prepare(`${sel} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY k.pinned DESC, k.updated_at DESC, k.id DESC LIMIT ?`).all(...args, limit).map(shape);
  }
  function get(id) {
    const r = /^\d+$/.test(String(id)) ? db.prepare(`${sel} WHERE k.id = ?`).get(Number(id)) : null;
    if (!r) throw new SimError(404, 'Không có mục kiến thức này.');
    return shape(r);
  }
  function create(input) {
    const v = validate(input);
    const id = Number(db.prepare('INSERT INTO knowledge (kind, title, body, tags, source, pinned, search) VALUES (?,?,?,?,?,?,?)')
      .run(v.kind, v.title, v.body, v.tags.join(','), 'manual', v.pinned ? 1 : 0, searchOf(v.title, v.body, v.tags)).lastInsertRowid);
    return get(id);
  }
  function update(id, input) {
    const cur = db.prepare('SELECT * FROM knowledge WHERE id = ?').get(Number(id));
    if (!/^\d+$/.test(String(id)) || !cur) throw new SimError(404, 'Không có mục kiến thức này.');
    const v = validate(input, { partial: true, base: cur });
    db.prepare("UPDATE knowledge SET kind = ?, title = ?, body = ?, tags = ?, pinned = ?, search = ?, updated_at = datetime('now') WHERE id = ?")
      .run(v.kind, v.title, v.body, v.tags.join(','), v.pinned ? 1 : 0, searchOf(v.title, v.body, v.tags), cur.id);
    return get(cur.id);
  }
  function remove(id) {
    const cur = /^\d+$/.test(String(id)) ? db.prepare('SELECT id FROM knowledge WHERE id = ?').get(Number(id)) : null;
    if (!cur) throw new SimError(404, 'Không có mục kiến thức này.');
    db.prepare('DELETE FROM knowledge WHERE id = ?').run(cur.id);
    return { ok: true };
  }
  function tags() {
    const counts = new Map();
    for (const r of db.prepare("SELECT tags FROM knowledge WHERE tags <> ''").all()) for (const t of r.tags.split(',')) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'vi')).slice(0, 40);
  }

  // Bài học tự động khi dự án xong: chi phí so với ước tính, lỗi đã gặp và cách tránh. Mỗi dự án chỉ có một bài học.
  function lessonForProject(projectId) {
    const p = db.prepare('SELECT id, title, kind, estimate, run_id FROM projects WHERE id = ?').get(Number(projectId));
    if (!p) return null;
    const spent = round2(Number(db.prepare('SELECT COALESCE(SUM(amount), 0) s FROM costs WHERE project_id = ?').get(p.id).s) || 0);
    const bugs = db.prepare(`SELECT b.title, d.name AS dept FROM bugs b JOIN departments d ON d.id = b.owner_dept_id WHERE b.project_id = ? ORDER BY b.id`).all(p.id);
    const overruns = db.prepare("SELECT COUNT(*) n FROM approvals WHERE project_id = ? AND kind = 'overrun' AND status = 'approved'").get(p.id).n;
    const secs = p.run_id == null ? null : db.prepare("SELECT strftime('%s', finished_at) - strftime('%s', created_at) AS s FROM runs WHERE id = ?").get(p.run_id)?.s;
    const diff = p.estimate > 0 ? Math.round((spent - p.estimate) / p.estimate * 100) : 0;
    const lines = [`Loại sản phẩm: ${PROJECT_KIND[p.kind] || p.kind}.`, `Chi phí ghi nhận ${spent.toFixed(2)} so với ước tính ${p.estimate.toFixed(2)} (${diff > 0 ? '+' : ''}${diff}%).`];
    lines.push(diff > 15 ? `Dự án tiêu nhiều hơn dự kiến. Lần sau nên ước tính cao hơn khoảng ${diff}% cho dự án loại này.` : diff < -15 ? 'Ước tính hơi dư so với thực tế, lần sau có thể giảm bớt.' : 'Ước tính sát với thực tế.');
    if (overruns) lines.push(`Cổng chi phí vượt ngân sách đã mở và được duyệt ${overruns} lần.`);
    if (bugs.length) { lines.push(`Kiểm thử tìm ra ${bugs.length} lỗi:`); for (const b of bugs) lines.push(`- ${b.title} (${b.dept}). Cách tránh: ${BUG_TIPS[b.title] || 'rà lại kỹ khi lập trình.'}`); }
    else lines.push('Kiểm thử không tìm ra lỗi nào.');
    if (secs != null) lines.push(`Thời gian chạy ${secs < 60 ? `${secs} giây` : `${Math.round(secs / 60)} phút`}.`);
    const kindTag = { web: 'web', exe: 'exe', landing: 'trang đích', mobile: 'di động' }[p.kind] || 'dự án';
    const tagList = [...new Set([kindTag, 'tự động', ...bugs.map(b => normTag(b.dept)).filter(t => TAG_RE.test(t))])].slice(0, MAX_TAGS);
    const title = `Bài học: ${p.title}`.slice(0, 120), body = lines.join('\n');
    const r = db.prepare('INSERT OR IGNORE INTO knowledge (kind, title, body, tags, source, project_id, pinned, search) VALUES (?,?,?,?,?,?,?,?)')
      .run('lesson', title, body, tagList.join(','), 'auto', p.id, 0, searchOf(title, body, tagList));
    return r.changes ? get(Number(r.lastInsertRowid)) : null;
  }

  return { list, get, create, update, remove, tags, lessonForProject };
}
