import { COURIER_TITLES } from './seed.js';
import { createProjects } from './projects.js';
// Các đường dẫn /api. Từ giai đoạn 2 có thêm vài thao tác ghi cho bộ máy mô phỏng (/api/sim/...).
const strip = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function createApi({ db, config, version, sim, hub }) {
  const projects = createProjects({ db, sim, config, hub });
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
    const count = sql => db.prepare(sql).get().n;
    return {
      agents: count('SELECT COUNT(*) n FROM agents'),
      departments: count('SELECT COUNT(*) n FROM departments'),
      working: count("SELECT COUNT(*) n FROM agents WHERE status IN ('working','reviewing')"),
      attention: count("SELECT COUNT(*) n FROM agents WHERE status = 'blocked'"),
      approvals: projects.pendingCount(),     // kế hoạch CTO đang chờ bạn duyệt
      pendingPlans: projects.pending().slice(0, 5),
      projects: sim ? sim.snapshot().overview.projects : 0,   // giai đoạn 5 sẽ thay bằng dự án thật
      monthCost: 0,          // giai đoạn 8
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
    '/api/sim/delivered': b => ({ ok: sim.delivered(b.runId, String(b.from), String(b.to)) }),
    '/api/sim/arrived': b => ({ ok: sim.arrived(b.agentId) }),
    '/api/sim/viewer': () => { sim.viewerPing(); return { ok: true }; },
    '/api/sim/clear': () => { sim.clear(); return { ok: true }; }
  };

  return function handle(method, url, body = {}) {
    const p = url.pathname;
    if (method === 'POST') {
      if (p === '/api/projects') return { status: 201, body: projects.create(body) };
      const pm = p.match(/^\/api\/projects\/(\d+)\/(approve|reject)$/);
      if (pm) return ok(pm[2] === 'approve' ? projects.approve(pm[1], body) : projects.reject(pm[1]));
      const fn = sim && SIM_POST[p];
      return fn ? ok(fn(body)) : null;
    }
    if (p === '/api/projects') return ok(projects.list(url.searchParams.get('limit')));
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
      return a ? ok(a) : notFound('Không có người này.');
    }

    if (p === '/api/search') {
      const q = strip((url.searchParams.get('q') || '').trim());
      if (!q) return ok({ departments: [], agents: [] });
      return ok({
        departments: listDepts().filter(d => strip(`${d.code} ${d.name} ${d.nameEn} ${d.role}`).includes(q)).slice(0, 6),
        agents: listAgents().filter(a => strip(`${a.name} ${a.title} ${a.deptName}`).includes(q)).slice(0, 8)
      });
    }
    return null;
  };
}
