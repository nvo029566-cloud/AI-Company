import { COURIER_TITLES } from './seed.js';
import { createProjects } from './projects.js';
import { createApprovals } from './approvals.js';
import { createCosts } from './costs.js';
import { createReports } from './reports.js';
import { createNotifier } from './notify.js';
import { createKnowledge } from './knowledge.js';
import { createSettings } from './settings.js';
import { createAssistant } from './assistant.js';
// Các đường dẫn /api. Từ giai đoạn 2 có thêm vài thao tác ghi cho bộ máy mô phỏng (/api/sim/...).
const strip = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function createApi({ db, config, version, sim, hub, notifier: givenNotifier, knowledge: givenKnowledge }) {
  const projects = createProjects({ db, sim, config, hub });
  const approvals = createApprovals({ db, sim, projects });
  const costs = createCosts({ db, config });
  const reports = createReports({ db, projects });
  const notifier = givenNotifier || createNotifier({ db, hub, config });
  const knowledge = givenKnowledge || createKnowledge({ db });
  const settings = createSettings({ db, config, sim, hub, hooks: { costCheck: () => notifier.costCheck() } });
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
      monthCost: mc.spent,                            // chi phí mô phỏng đã ghi nhận trong tháng
      costLevel: mc.level,                            // ok | warn (từ 80%) | over (từ 100%)
      costPct: mc.pct,
      unreadNotifications: notifier.unreadCount(),
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
    let pg = p.match(/^\/api\/projects\/(\d+)$/);
    if (pg) return ok(projects.get(pg[1]));
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
