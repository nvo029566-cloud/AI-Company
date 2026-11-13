import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DEPARTMENTS, AGENTS } from './seed.js';
import { strip } from './text.js';

// Mỗi giai đoạn sau thêm một migration mới ở cuối danh sách. Không sửa migration đã chạy.
// Quy tắc dùng chung có sẵn: nền của kho kiến thức. Bạn thêm, sửa, xoá được ở trang Kiến thức.
const SEED_RULES = [
  ['Mọi bản phát hành cần CEO cho phép', 'Không đưa sản phẩm ra ngoài khi chưa có phiếu cho phép phát hành của CEO. Từ chối phiếu nghĩa là dừng dự án.', 'phát hành,phê duyệt'],
  ['Kiểm tra đầu vào ở máy chủ', 'Mọi dữ liệu người dùng gửi lên đều phải được kiểm tra ở máy chủ, không chỉ ở giao diện. Giao diện chỉ để báo lỗi sớm cho người dùng.', 'an ninh,máy chủ'],
  ['Chống bấm hai lần', 'Nút gửi phải bị khoá sau lần bấm đầu tiên, và máy chủ phải chịu được yêu cầu bị gửi trùng mà không lưu hai lần.', 'giao diện,lỗi thường gặp'],
  ['Ngân sách dự án dư 15%', 'Ngân sách của một dự án bằng ước tính của kế hoạch nhân 1,15. Vượt mức đó thì dự án dừng lại chờ CEO duyệt thêm.', 'chi phí,phê duyệt'],
  ['Sửa lỗi xong phải kiểm lại', 'Lỗi do phòng Kiểm thử tìm ra phải được chính người làm ra lỗi sửa, rồi phòng Kiểm thử kiểm lại trước khi dự án đi tiếp sang chặng sau.', 'kiểm thử,lỗi']
];

const MIGRATIONS = [
  {
    id: 1,
    name: 'nền tảng: phòng ban và agent',
    up(db) {
      db.exec(`
        CREATE TABLE departments (
          id INTEGER PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          slug TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          name_en TEXT NOT NULL,
          lane TEXT NOT NULL CHECK (lane IN ('pipeline','parallel','support')),
          color TEXT NOT NULL,
          role TEXT NOT NULL,
          sort INTEGER NOT NULL
        );
        CREATE TABLE agents (
          id INTEGER PRIMARY KEY,
          dept_id INTEGER NOT NULL REFERENCES departments(id),
          name TEXT NOT NULL,
          title TEXT NOT NULL,
          is_lead INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','working','reviewing','blocked')),
          model TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_agents_dept ON agents(dept_id);
      `);
      const insDept = db.prepare('INSERT INTO departments (code, slug, name, name_en, lane, color, role, sort) VALUES (?,?,?,?,?,?,?,?)');
      DEPARTMENTS.forEach((d, i) => insDept.run(d.code, d.slug, d.name, d.nameEn, d.lane, d.color, d.role, i + 1));
      const byCode = Object.fromEntries(db.prepare('SELECT id, code FROM departments').all().map(r => [r.code, r.id]));
      const insAgent = db.prepare('INSERT INTO agents (dept_id, name, title, is_lead) VALUES (?,?,?,?)');
      AGENTS.forEach(a => insAgent.run(byCode[a.dept], a.name, a.title, a.lead ? 1 : 0));
    }
  },
  {
    id: 2,
    name: 'bộ máy mô phỏng: cài đặt, lượt chạy, việc',
    up(db) {
      db.exec(`
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE runs (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          kind TEXT NOT NULL,
          state TEXT NOT NULL DEFAULT 'running' CHECK (state IN ('running','done','cancelled')),
          stage INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          finished_at TEXT
        );
        CREATE TABLE work_items (
          id INTEGER PRIMARY KEY,
          run_id INTEGER NOT NULL REFERENCES runs(id),
          stage INTEGER NOT NULL,
          dept_id INTEGER NOT NULL REFERENCES departments(id),
          agent_id INTEGER REFERENCES agents(id),
          title TEXT NOT NULL,
          support INTEGER NOT NULL DEFAULT 0,
          state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','working','done','cancelled')),
          progress REAL NOT NULL DEFAULT 0,
          duration REAL NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          started_at TEXT,
          finished_at TEXT
        );
        CREATE INDEX idx_items_run ON work_items(run_id);
        CREATE INDEX idx_items_state ON work_items(state);
      `);
    }
  },
  {
    id: 3,
    name: 'giai đoạn 4: yêu cầu của CEO và kế hoạch của CTO',
    up(db) {
      db.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          kind TEXT NOT NULL,
          request TEXT NOT NULL,
          plan TEXT NOT NULL,
          estimate REAL NOT NULL,
          status TEXT NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting','running','done','rejected','cancelled')),
          run_id INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          decided_at TEXT,
          finished_at TEXT
        );
        CREATE INDEX idx_projects_status ON projects(status);
        ALTER TABLE runs ADD COLUMN project_id INTEGER;
      `);
    }
  },
  {
    id: 4,
    name: 'giai đoạn 6-7: lỗi, việc sửa lỗi và kiểm lại',
    up(db) {
      db.exec(`
        CREATE TABLE bugs (
          id INTEGER PRIMARY KEY,
          run_id INTEGER NOT NULL REFERENCES runs(id),
          project_id INTEGER,
          title TEXT NOT NULL,
          severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixing','fixed','closed','cancelled')),
          owner_agent_id INTEGER NOT NULL REFERENCES agents(id),
          owner_dept_id INTEGER NOT NULL REFERENCES departments(id),
          found_by_agent_id INTEGER REFERENCES agents(id),
          work_item_id INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          fixing_at TEXT,
          fixed_at TEXT,
          closed_at TEXT
        );
        CREATE INDEX idx_bugs_status ON bugs(status);
        CREATE INDEX idx_bugs_owner ON bugs(owner_agent_id);
        CREATE INDEX idx_bugs_run ON bugs(run_id);
        ALTER TABLE work_items ADD COLUMN kind TEXT NOT NULL DEFAULT 'main';
        ALTER TABLE work_items ADD COLUMN bug_id INTEGER;
        UPDATE work_items SET kind = 'support' WHERE support = 1;
      `);
    }
  },
  {
    id: 5,
    name: 'giai đoạn 8: chi phí, phê duyệt, triển khai',
    up(db) {
      db.exec(`
        ALTER TABLE projects ADD COLUMN budget REAL;
        CREATE TABLE costs (
          id INTEGER PRIMARY KEY,
          run_id INTEGER NOT NULL,
          project_id INTEGER,
          work_item_id INTEGER,
          agent_id INTEGER,
          dept_id INTEGER NOT NULL REFERENCES departments(id),
          kind TEXT NOT NULL CHECK (kind IN ('work','fix','retest','support')),
          amount REAL NOT NULL,
          tokens_in INTEGER NOT NULL,
          tokens_out INTEGER NOT NULL,
          model TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_costs_project ON costs(project_id);
        CREATE INDEX idx_costs_created ON costs(created_at);
        CREATE TABLE approvals (
          id INTEGER PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('release','overrun')),
          project_id INTEGER NOT NULL,
          run_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
          title TEXT NOT NULL,
          detail TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          decided_at TEXT
        );
        CREATE INDEX idx_approvals_status ON approvals(status);
        CREATE TABLE deployments (
          id INTEGER PRIMARY KEY,
          project_id INTEGER NOT NULL,
          run_id INTEGER NOT NULL,
          version TEXT NOT NULL,
          kind TEXT NOT NULL,
          artifact TEXT NOT NULL,
          approval_id INTEGER,
          cost REAL NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_deployments_project ON deployments(project_id);
      `);
    }
  },
  {
    id: 6,
    name: 'giai đoạn 9: thông báo, kiến thức',
    up(db) {
      db.exec(`
        CREATE TABLE notifications (
          id INTEGER PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('approval','finished','bug','cost','stopped')),
          level TEXT NOT NULL CHECK (level IN ('info','ok','warn','bad')),
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          link TEXT,
          project_id INTEGER,
          dedupe TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          read_at TEXT
        );
        CREATE INDEX idx_notifications_read ON notifications(read_at);
        CREATE UNIQUE INDEX idx_notifications_dedupe ON notifications(dedupe) WHERE dedupe IS NOT NULL;
        CREATE TABLE knowledge (
          id INTEGER PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('rule','note','lesson')),
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          tags TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','auto','seed')),
          project_id INTEGER,
          pinned INTEGER NOT NULL DEFAULT 0,
          search TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE UNIQUE INDEX idx_knowledge_lesson ON knowledge(project_id) WHERE kind = 'lesson' AND project_id IS NOT NULL;
      `);
      const ins = db.prepare('INSERT INTO knowledge (kind, title, body, tags, source, pinned, search) VALUES (?,?,?,?,?,?,?)');
      for (const [title, body, tags] of SEED_RULES) ins.run('rule', title, body, tags, 'seed', 1, strip(`${title} ${body} ${tags}`));
    }
  }
];

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  const done = new Set(db.prepare('SELECT id FROM schema_migrations').all().map(r => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    db.exec('BEGIN');
    try {
      m.up(db);
      db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(m.id, m.name);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${m.id} (${m.name}) lỗi: ${e.message}`);
    }
  }
}
