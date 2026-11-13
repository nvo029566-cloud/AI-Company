import { SimError } from './sim.js';

// Mọi thứ cần bạn quyết định: kế hoạch của CTO (duyệt ở Phòng điều hành), cho phép phát hành, chi phí vượt ngân sách.
export const APPROVAL_KIND_LABEL = { plan: 'Kế hoạch của CTO', release: 'Cho phép phát hành', overrun: 'Chi phí vượt ngân sách' };
export const DECISION_LABEL = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối', cancelled: 'Đã huỷ' };
const STATUS_FILTERS = ['pending', 'history', 'all'];

export function createApprovals({ db, sim, projects }) {
  const gateRows = db.prepare(`SELECT a.*, p.title AS projectTitle FROM approvals a LEFT JOIN projects p ON p.id = a.project_id ORDER BY a.id DESC LIMIT 300`);
  const gateOne = db.prepare(`SELECT a.*, p.title AS projectTitle FROM approvals a LEFT JOIN projects p ON p.id = a.project_id WHERE a.id = ?`);
  const planRows = db.prepare('SELECT id, title, kind, estimate, status, created_at, decided_at FROM projects ORDER BY id DESC LIMIT 300');
  const gatesPending = db.prepare("SELECT COUNT(*) n FROM approvals WHERE status = 'pending'");
  const markCancelled = db.prepare("UPDATE approvals SET status = 'cancelled', decided_at = datetime('now') WHERE id = ? AND status = 'pending'");

  const gateItem = r => {
    const detail = JSON.parse(r.detail);
    return {
      key: `gate-${r.id}`, id: r.id, type: 'gate', kind: r.kind, kindLabel: APPROVAL_KIND_LABEL[r.kind], title: r.title,
      projectId: r.project_id, projectTitle: r.projectTitle, status: r.status, statusLabel: DECISION_LABEL[r.status],
      createdAt: r.created_at, decidedAt: r.decided_at, amount: r.kind === 'overrun' ? detail.raiseBy : detail.spent, detail
    };
  };
  const planItem = r => {
    const status = r.status === 'awaiting' ? 'pending' : (r.status === 'rejected' ? 'rejected' : 'approved');
    return {
      key: `plan-${r.id}`, id: r.id, type: 'plan', kind: 'plan', kindLabel: APPROVAL_KIND_LABEL.plan, title: r.title,
      projectId: r.id, projectTitle: r.title, status, statusLabel: DECISION_LABEL[status], createdAt: r.created_at, decidedAt: r.decided_at,
      amount: r.estimate, detail: { projectKind: r.kind, estimate: r.estimate }
    };
  };
  const all = () => [...gateRows.all().map(gateItem), ...planRows.all().map(planItem)];

  function list({ status = 'all' } = {}) {
    if (!STATUS_FILTERS.includes(status)) throw new SimError(400, 'Bộ lọc không hợp lệ.');
    const items = all();
    const pending = items.filter(i => i.status === 'pending').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.key.localeCompare(b.key));
    const history = items.filter(i => i.status !== 'pending').sort((a, b) => String(b.decidedAt || b.createdAt).localeCompare(String(a.decidedAt || a.createdAt))).slice(0, 100);
    return status === 'pending' ? pending : status === 'history' ? history : [...pending, ...history];
  }

  function resolve(id, approve) {
    if (!/^\d+$/.test(String(id))) throw new SimError(404, 'Không có phiếu này.');
    const row = gateOne.get(Number(id));
    if (!row) throw new SimError(404, 'Không có phiếu này.');
    if (row.status !== 'pending') throw new SimError(409, 'Phiếu này đã được xử lý rồi.');
    if (!sim) throw new SimError(503, 'Bộ máy chạy việc chưa sẵn sàng.');
    if (!sim.resolveGate(row.id, !!approve)) {          // lượt chạy đã không còn (máy chủ khởi động lại hoặc đã bấm xoá việc)
      markCancelled.run(row.id);
      throw new SimError(409, 'Dự án này đã dừng nên không còn gì để duyệt.');
    }
    return gateItem(gateOne.get(row.id));
  }

  return {
    list, resolve,
    pendingCount: () => projects.pendingCount() + gatesPending.get().n,
    pending: (limit = 5) => list({ status: 'pending' }).slice(0, limit).map(i => ({ key: i.key, id: i.id, type: i.type, kind: i.kind, kindLabel: i.kindLabel, title: i.title, amount: i.amount }))
  };
}
