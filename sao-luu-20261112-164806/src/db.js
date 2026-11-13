import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DEPARTMENTS, AGENTS } from './seed.js';

// Mỗi giai đoạn sau thêm một migration mới ở cuối danh sách. Không sửa migration đã chạy.
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
