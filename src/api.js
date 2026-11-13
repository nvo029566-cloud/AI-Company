import { statSync } from 'node:fs';
import { COURIER_TITLES } from './seed.js';
import { createProjects } from './projects.js';
import { createApprovals } from './approvals.js';
import { createCosts } from './costs.js';
import { createReports } from './reports.js';
import { createNotifier } from './notify.js';
import { createKnowledge } from './knowledge.js';
import { createSettings } from './settings.js';
import { createAssistant } from './assistant.js';
import { createHeatmap } from './heatmap.js';
import { SimError } from './sim.js';
import { AiError } from './ai/errors.js';
// Lỗi từ nhà cung cấp AI thành lỗi có mã HTTP phù hợp: lỗi do bạn (khoá, mô hình, yêu cầu) là 400, lỗi từ phía họ hoặc mạng là 502.
const aiHttpError = e => { if (e instanceof AiError) throw new SimError(['auth', 'model', 'request', 'disabled', 'limit', 'price', 'billing'].includes(e.kind) ? 400 : 502, e.message); throw e; };
// Các đường dẫn /api. Từ giai đoạn 2 có thêm vài thao tác ghi cho bộ máy mô phỏng (/api/sim/...).
const strip = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function createApi({ db, config, version, sim, hub, notifier: givenNotifier, knowledge: givenKnowledge, ai = null, backups = null, system = {} }) {
  const startedAt = Date.now();
  const projects = createProjects({ db, sim, config, hub, ai });
  const approvals = createApprovals({ db, sim, projects });
  const costs = createCosts({ db, config });
  const reports = createReports({ db, projects });
  const heatmap = createHeatmap({ db });
  const notifier = givenNotifier || createNotifier({ db, hub, config });
  const knowledge = givenKnowledge || createKnowledge({ db });
  const settings = createSettings({ db, config, sim, hub, ai, hooks: { costCheck: () => notifier.costCheck() } });
  const assistant = createAssistant({ db, projects, approvals, costs, work: projects.work, bugs: projects.bugs, knowledge, reports, notifier });
  const deptSql = `
    SELECT d.id, d.code, d.slug, d.name, d.name_en AS nameEn, d.lane, d.color, d.role, d.sort,
      (SELECT COUNT(*) FROM agents a WHERE a.dept_id = d.id) AS total,
      (SELECT COUNT(*) FROM agents a WHERE a.dept_id = d.id AND a.status IN ('working','reviewing')) AS working
    FROM departments d`;
  const agentSql = `
    SELECT a.id, a.name, a.title, a.is_lead AS isLead, a.status, a.model,
           d.code AS deptCode, d.name AS deptName, d.color AS deptColor
    FROM agents a JOIN departments d ON d.id = a.dept_id`;

  const listDepts = () => db.prepare(deptSql + ' ORDER BY d.sort').all().map(d => ({ ...d }));
  const listAgents = () => db.prepare(agentSql + ' ORDER BY d.sort, a.is_lead DESC, a.id').all().map(a => ({ ...a, isLead: !!a.isLead, courier: COURIER_TITLES.includes(a.title) }));

  const overview = () => {
    const count = sql => db.prepare(sql).get().n, mc = costs.monthStatus();
    return {
      agents: count('SELECT COUNT(*) n FROM agents'),
      departments: count('SELECT COUNT(*) n FROM departments'),
      working: count("SELECT COUNT(*) n FROM agents WHERE status IN ('working','reviewing')"),
      attention: count("SELECT COUNT(*) n FROM agents WHERE status = 'blocked'"),
      approvals: approvals.pendingCount(),     // kế hoạch CTO và các cổng (phát hành, chi phí vượt) đang chờ bạn duyệt
      pendingItems: approvals.pending(5),
      bugsActive: projects.bugs.summary().active,     // lỗi chưa đóng (chờ sửa, đang sửa, chờ kiểm lại)
      pendingPlans: projects.pending().slice(0, 5),
      projects: sim ? sim.snapshot().overview.projects : 0,   // giai đoạn 5 sẽ thay bằng dự án thật
      monthCost: mc.spent,                            // tiền THẬT đã tiêu trong tháng (từ AI thật)
      monthSimulated: mc.simulated,                   // chi phí mô phỏng trong tháng, tách riêng và không tính vào ngân sách
      costLevel: mc.level,                            // ok | warn (từ 80%) | over (từ 100%)
      costPct: mc.pct,
      unreadNotifications: notifier.unreadCount(),
      ai: ai ? { active: ai.enabled(), tier: ai.status().tier } : { active: false, tier: 'free' },     // AI thật đang bật hay đang mô phỏng
      monthlyBudget: config.monthlyBudget,
      laptops: 1,
      system: 'ổn định'
    };
  };

  const ok = body => ({ status: 200, body });
  const notFound = msg => ({ status: 404, body: { error: msg } });

  const SIM_POST = {
    '/api/sim/spawn': b => ({ run: sim.spawn({ title: b.title, kind: b.kind }) }),
    '/api/sim/speed': b => ({ speed: sim.setSpeed(b.speed) }),
    '/api/sim/auto': b => ({ auto: sim.setAuto(b.on) }),
    '/api/sim/delivered': b => ({ ok: sim.delivered(b.runId, String(b.from), String(b.to), b.bugId == null ? null : Number(b.bugId)) }),
    '/api/sim/arrived': b => ({ ok: sim.arrived(b.agentId) }),
    '/api/sim/viewer': () => { sim.viewerPing(); return { ok: true }; },
    '/api/sim/clear': () => { sim.clear(); return { ok: true }; }
  };

  return function handle(method, url, body = {}) {
    const p = url.pathname;
    if (method === 'POST') {
      if (p === '/api/projects') return { status: 201, body: projects.create(body) };
      if (p === '/api/backups') { if (!backups) throw new SimError(400, 'Cơ sở dữ liệu tạm không sao lưu được.'); return { status: 201, body: backups.create('manual') }; }
      if (p === '/api/backups/cancel-restore') { if (!backups) throw new SimError(400, 'Cơ sở dữ liệu tạm không sao lưu được.'); return ok(backups.cancelRestore()); }
      const bm = p.match(/^\/api\/backups\/([A-Za-z0-9-]+)\/(delete|restore)$/);
      if (bm) { if (!backups) throw new SimError(400, 'Cơ sở dữ liệu tạm không sao lưu được.'); return ok(bm[2] === 'delete' ? backups.remove(bm[1]) : backups.requestRestore(bm[1])); }
      if (p === '/api/ai/key') { if (!ai) throw new SimError(400, 'Chưa có bộ AI.'); ai.setKey(body.key, body.provider); return ok(ai.status()); }
      if (p === '/api/ai/key/delete') {
        if (!ai) throw new SimError(400, 'Chưa có bộ AI.');
        const prov = body.provider || 'gemini';
        if (ai.status().enabled && prov === ai.status().provider) settings.update({ aiEnabled: false });      // xoá khoá của nhà đang dùng thì AI tắt luôn, các dự án đang dùng AI bị dừng
        ai.removeKey(prov); return ok(ai.status());
      }
      if (p === '/api/ai/test') { if (!ai) throw new SimError(400, 'Chưa có bộ AI.'); return ai.test({ provider: body.provider, model: body.model }).then(ok, aiHttpError); }
      if (p === '/api/ai/kill') { if (!ai) throw new SimError(400, 'Chưa có bộ AI.'); ai.kill('Bạn đã bấm tắt khẩn cấp.'); sim?.cancelAiRuns('Bạn đã bấm tắt khẩn cấp.'); settings.update({ aiEnabled: false }); return ok(ai.status()); }
      if (p === '/api/settings') return ok(settings.update(body));
      if (p === '/api/settings/reset') return ok(settings.reset());
      if (p === '/api/notifications/read') return ok(notifier.markRead(body));
      if (p === '/api/assistant') return ok(assistant.ask(body.question));
      if (p === '/api/knowledge') return { status: 201, body: knowledge.create(body) };
      const km = p.match(/^\/api\/knowledge\/(\d+)\/(update|delete)$/);
      if (km) return ok(km[2] === 'update' ? knowledge.update(km[1], body) : knowledge.remove(km[1]));
      const am = p.match(/^\/api\/approvals\/(\d+)\/(approve|reject)$/);
      if (am) return ok(approvals.resolve(am[1], am[2] === 'approve'));
      const pm = p.match(/^\/api\/projects\/(\d+)\/(approve|reject)$/);
      if (pm) return ok(pm[2] === 'approve' ? projects.approve(pm[1], body) : projects.reject(pm[1]));
      const fn = sim && SIM_POST[p];
      return fn ? ok(fn(body)) : null;
    }
    if (p === '/api/projects') return ok(projects.list(url.searchParams.get('limit')));
    if (p === '/api/tasks') return ok(projects.work.list(Object.fromEntries(url.searchParams)));
    if (p === '/api/bugs') return ok(projects.bugs.list(Object.fromEntries(url.searchParams)));
    if (p === '/api/bugs/summary') return ok(projects.bugs.summary());
    if (p === '/api/settings') return ok(settings.current());
    if (p === '/api/notifications') return ok({ items: notifier.list(Object.fromEntries(url.searchParams)), unread: notifier.unreadCount() });
    if (p === '/api/knowledge') return ok(knowledge.list(Object.fromEntries(url.searchParams)));
    if (p === '/api/knowledge/tags') return ok(knowledge.tags());
    const kg = p.match(/^\/api\/knowledge\/(\d+)$/);
    if (kg) return ok(knowledge.get(kg[1]));
    if (p === '/api/approvals') return ok(approvals.list(Object.fromEntries(url.searchParams)));
    if (p === '/api/costs/summary') return ok(costs.summary());
    if (p === '/api/costs') return ok(costs.list(Object.fromEntries(url.searchParams)));
    if (p === '/api/deployments') return ok(reports.deployments());
    if (p === '/api/reports/company') return ok(reports.company(url.searchParams.get('period') || '7'));
    const rp = p.match(/^\/api\/reports\/project\/(\d+)$/);
    if (rp) return ok(reports.project(rp[1]));
    if (p === '/api/backups') return ok({ available: !!backups, items: backups ? backups.list().map(m => ({ ...m, bytes: m.dbBytes + (m.fileBytes || 0) })) : [], pending: backups ? backups.pending() : null, keep: 10 });
    if (p === '/api/system') {
      const size = f => { try { return statSync(f).size; } catch { return 0; } };
      const last = db.prepare("SELECT value FROM settings WHERE key = 'system.lastRestore'").get();
      return ok({ version, node: process.version, platform: process.platform, arch: process.arch, uptimeSec: Math.round((Date.now() - startedAt) / 1000), dataDir: system.dataDir || null, dbBytes: system.dbFile ? size(system.dbFile) + size(system.dbFile + '-wal') : 0,       // gồm cả tệp nhật ký WAL, nơi dữ liệu mới nằm trước khi gộp vào tệp chính
        schema: db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, backups: backups ? backups.list().length : 0, lastBackup: backups ? (backups.list()[0]?.createdAt || null) : null,
        lastRestore: last ? JSON.parse(last.value) : null, aiActive: ai ? ai.status().active : false });
    }
    if (p === '/api/heatmap') return ok(heatmap.get({ metric: url.searchParams.get('metric') || 'tasks', period: url.searchParams.get('period') || '7' }));
    if (p === '/api/ai/status') return ok(ai ? ai.status() : { available: false, enabled: false, active: false, hasKey: false });
    const pf = p.match(/^\/api\/projects\/(\d+)\/files$/);
    if (pf) { projects.get(pf[1]); return ok(ai ? ai.files(Number(pf[1])) : []); }
    const pfile = p.match(/^\/api\/projects\/(\d+)\/file$/);
    if (pfile) { projects.get(pfile[1]); const f = ai ? ai.readFile(Number(pfile[1]), url.searchParams.get('path') || '') : null; return f ? ok(f) : notFound('Không có tệp này.'); }
    let pg = p.match(/^\/api\/projects\/(\d+)$/);
    if (pg) { const d = projects.get(pg[1]); return ok(d.ai && ai ? { ...d, files: ai.files(d.id), aiUsage: ai.usage(d.id), folder: `data/projects/${d.id}` } : d); }
    if (p === '/api/sim') return sim ? ok(sim.snapshot()) : null;
    if (p === '/api/health') return ok({ ok: true, version, time: new Date().toISOString() });
    if (p === '/api/config') return ok({ brandName: config.brandName, tagline: config.tagline, currency: config.currency, monthlyBudget: config.monthlyBudget });
    if (p === '/api/overview') return ok(overview());
    if (p === '/api/departments') return ok(listDepts());

    let m = p.match(/^\/api\/departments\/([\w-]+)$/);
    if (m) {
      const d = listDepts().find(x => x.code === m[1] || x.slug === m[1]);
      if (!d) return notFound('Không có phòng này.');
      return ok({ ...d, agents: listAgents().filter(a => a.deptCode === d.code) });
    }

    if (p === '/api/agents') {
      const dept = url.searchParams.get('dept');
      return ok(listAgents().filter(a => !dept || a.deptCode === dept));
    }
    m = p.match(/^\/api\/agents\/(\d+)$/);
    if (m) {
      const a = listAgents().find(x => x.id === Number(m[1]));
      return a ? ok({ ...a, ...projects.work.agentTasks(a.id), bugs: projects.bugs.list({ agent: a.id, status: 'active' }) }) : notFound('Không có người này.');
    }

    if (p === '/api/search') {
      const q = strip((url.searchParams.get('q') || '').trim());
      if (!q) return ok({ departments: [], agents: [], projects: [], knowledge: [] });
      return ok({
        projects: projects.list(100).filter(x => strip(x.title).includes(q)).slice(0, 5).map(x => ({ id: x.id, title: x.title, statusLabel: x.statusLabel, status: x.status })),
        knowledge: knowledge.list({ q: url.searchParams.get('q'), limit: 5 }).map(k => ({ id: k.id, title: k.title, kindLabel: k.kindLabel })),
        departments: listDepts().filter(d => strip(`${d.code} ${d.name} ${d.nameEn} ${d.role}`).includes(q)).slice(0, 6),
        agents: listAgents().filter(a => strip(`${a.name} ${a.title} ${a.deptName}`).includes(q)).slice(0, 8)
      });
    }
    return null;
  };
}
