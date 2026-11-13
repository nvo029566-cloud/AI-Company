import { AiError, retryable } from './errors.js';
import { createGemini } from './gemini.js';
import { createOpenAI } from './openai.js';
import { createAnthropic } from './anthropic.js';
import { PROVIDERS, PROVIDER_IDS, resolveModel } from './providers.js';
import { SimError } from '../sim.js';
import { createLimiter } from './limiter.js';
import { redact } from './secrets.js';
import { writeProjectFiles, listFiles, readProjectFile, projectDir } from './files.js';
import { runChecks } from './checks.js';
import { TASKS, systemPrompt, contextBlock, workPrompt, fixPrompt, reviewPrompt, verifyPrompt } from './prompts.js';
import { normalizeAiConfig } from './config.js';

// Dịch vụ AI: một cửa duy nhất để công ty gọi mô hình thật.
// Mọi lời gọi đều đi qua: kiểm tra giới hạn (bật/tắt, số lời gọi trong ngày, ngân sách tháng, đơn giá) → hàng đợi giới hạn tốc độ → thử lại khi lỗi tạm thời.
export const MAX_ATTEMPTS = 5;
const round6 = n => Math.round(n * 1e6) / 1e6;
const SEVERITIES = ['low', 'medium', 'high'];
const abortableSleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new AiError('aborted', 'Đã dừng lời gọi AI.'));
  const t = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(t); reject(new AiError('aborted', 'Đã dừng lời gọi AI.')); };
  signal?.addEventListener?.('abort', onAbort, { once: true });
});
const waitFor = (promise, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new AiError('aborted', 'Đã dừng lời gọi AI.'));
  const onAbort = () => reject(new AiError('aborted', 'Đã dừng lời gọi AI.'));
  signal?.addEventListener?.('abort', onAbort, { once: true });
  promise.then(v => { signal?.removeEventListener?.('abort', onAbort); resolve(v); }, e => { signal?.removeEventListener?.('abort', onAbort); reject(e); });
});

export function parseModelJson(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { const v = JSON.parse(t); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { /* thử cắt */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { const v = JSON.parse(t.slice(a, b + 1)); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { /* hỏng */ } }
  return null;
}

export function createAi({ db, config, secrets, hub, dataDir, getRules = () => [], fetchImpl = fetch, sleep = abortableSleep, now = Date.now }) {
  const cfg = () => normalizeAiConfig(config);
  cfg();
  const providers = {
    gemini: createGemini({ fetchImpl, baseUrl: config.ai.baseUrl, getKey: () => secrets.get('gemini') }),
    openai: createOpenAI({ fetchImpl, baseUrl: config.ai.baseUrl, getKey: () => secrets.get('openai') }),
    anthropic: createAnthropic({ fetchImpl, baseUrl: config.ai.baseUrl, getKey: () => secrets.get('anthropic') })
  };
  // Mỗi nhà cung cấp có hạn mức riêng nên có hàng đợi riêng.
  const limiters = Object.fromEntries(PROVIDER_IDS.map(id => [id, createLimiter({ getRpm: () => cfg().rpm, concurrency: 2 })]));
  const limiter = {
    flush: reason => { for (const l of Object.values(limiters)) l.flush(reason); },
    stats: () => Object.values(limiters).reduce((a, l) => { const s = l.stats(); return { queued: a.queued + s.queued, running: a.running + s.running, waitingUntil: Math.max(a.waitingUntil, s.waitingUntil) }; }, { queued: 0, running: 0, waitingUntil: 0 })
  };
  const resolve = spec => resolveModel(spec, cfg().provider);
  // Gemini ở bậc miễn phí thì không tính tiền; mọi trường hợp còn lại tính theo bảng đơn giá.
  const isPriced = provider => !(provider === 'gemini' && cfg().tier === 'free');
  const priceOf = (spec, r) => { const p = cfg().prices; return p[spec] || p[r.canon] || p[r.model] || null; };
  let killCtl = new AbortController();
  const pending = new Map();           // `${runId}:${dept}` -> lời hứa "phòng này xong", cho phòng phụ thuộc chờ
  let lastError = null;
  const emit = (e, d) => hub?.broadcast?.(e, d);

  const monthSpent = () => Number(db.prepare("SELECT COALESCE(SUM(amount), 0) s FROM costs WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') AND model <> 'Mô phỏng'").get().s) || 0;
  const todayCalls = () => db.prepare("SELECT COUNT(*) n, COALESCE(SUM(tokens_in), 0) ti, COALESCE(SUM(tokens_out), 0) tp, COALESCE(SUM(cost), 0) c FROM ai_calls WHERE date(created_at) = date('now')").get();
  const enabled = () => cfg().enabled && !!secrets.get(cfg().provider);
  const modelFor = dept => cfg().deptModels[dept] || cfg().model;

  // Các hàng rào cứng, kiểm tra trước MỖI lời gọi (kể cả lần thử lại).
  function guard(spec, testOnly = false) {
    const a = cfg(), r = resolve(spec), P = PROVIDERS[r.provider];
    if (!a.enabled && !testOnly) throw new AiError('disabled', 'AI thật đang tắt.');
    if (!secrets.get(r.provider)) throw new AiError('disabled', `Chưa có khoá API của ${P.label}. Hãy dán khoá ở Cài đặt, mục AI thật.`);
    const t = todayCalls();
    if (t.n >= a.dailyCalls) throw new AiError('limit', `Đã chạm giới hạn ${a.dailyCalls} lời gọi AI trong ngày. Bạn có thể tăng giới hạn ở Cài đặt.`);
    if (isPriced(r.provider)) {
      if (!priceOf(spec, r) && !testOnly) throw new AiError('price', `Chưa có đơn giá cho mô hình "${spec}". Hãy nhập đơn giá ở Cài đặt rồi thử lại.`);
      const budget = Number(config.monthlyBudget) || 0;
      if (budget > 0 && monthSpent() >= budget) throw new AiError('limit', 'Đã chạm ngân sách tháng nên AI tự dừng. Hãy tăng ngân sách tháng ở Cài đặt nếu muốn chạy tiếp.');
    }
  }
  function costOf(spec, r, out) {
    if (!isPriced(r.provider)) return 0;
    const p = priceOf(spec, r);
    return p ? round6((out.tokensIn * p.in + out.tokensOut * p.out) / 1e6) : 0;
  }
  function logCall(job, kind, r, { out = null, cost = 0, ok = 0, error = null, ms = 0 }) {
    const key = secrets.get(r.provider);
    db.prepare('INSERT INTO ai_calls (run_id, project_id, item_id, kind, provider, model, tokens_in, tokens_out, cost, ms, ok, error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(job?.runId ?? null, job?.projectId ?? null, job?.itemId ?? null, kind, r.provider, r.model, out?.tokensIn ?? 0, out?.tokensOut ?? 0, cost, out?.ms ?? ms, ok, error ? redact(error, key).slice(0, 300) : null);
    if (error) lastError = { at: new Date().toISOString(), message: redact(error, key).slice(0, 300) };
  }
  const backoff = attempt => Math.min(60000, 2000 * 2 ** (attempt - 1)) * (1 + Math.random() * 0.2);

  async function call(job, { kind, system, prompt, json = true, maxTokens, model: spec }) {
    const signal = AbortSignal.any([killCtl.signal, ...(job?.signal ? [job.signal] : [])]), r = resolve(spec);
    for (let attempt = 1; ; attempt++) {
      guard(spec, job?.kind === 'test');
      const t0 = now();
      try {
        const out = await limiters[r.provider].schedule(() => providers[r.provider].generate({ model: r.model, system, prompt, maxOutputTokens: maxTokens ?? cfg().maxTokens, json, signal }), signal);
        const cost = costOf(spec, r, out);
        logCall(job, kind, r, { out, cost, ok: 1 });
        job?.onUsage?.({ kind: job.kind, model: r.canon, tokensIn: out.tokensIn, tokensOut: out.tokensOut, amount: cost });
        emit('ai', { time: Date.now() });
        return out;
      } catch (e) {
        if (!(e instanceof AiError)) throw e;
        logCall(job, kind, r, { error: e.message, ms: now() - t0 });
        if (!retryable(e) || attempt >= MAX_ATTEMPTS) throw e;
        await sleep(Math.min(120000, e.retryAfter != null ? e.retryAfter * 1000 + 500 : backoff(attempt)), signal);
      }
    }
  }
  // Gọi và đọc JSON; nếu hỏng hoặc bị cắt thì thử đúng một lần nữa kèm lời nhắc.
  async function callJson(job, opts) {
    for (let k = 0; k < 2; k++) {
      const out = await call(job, { ...opts, prompt: k ? opts.prompt + '\n\nLƯU Ý: lần trả lời trước không phải JSON hợp lệ (có thể bị cắt vì quá dài). Hãy trả lại ĐÚNG một đối tượng JSON hợp lệ, gọn hơn.' : opts.prompt, json: true });
      const v = parseModelJson(out.text);
      if (v && !out.truncated) return { value: v, out };
    }
    throw new AiError('badresponse', 'Mô hình trả về dữ liệu không đọc được (không phải JSON hợp lệ), kể cả sau khi thử lại.');
  }

  const saveOutput = (job, summary) => db.prepare('INSERT INTO ai_outputs (run_id, project_id, dept_code, item_id, kind, summary) VALUES (?,?,?,?,?,?)').run(job.runId, job.projectId, job.dept, job.itemId ?? null, job.kind, String(summary).slice(0, 700));
  const summaryOf = v => String(typeof v.summary === 'string' ? v.summary : '').replace(/\s+/g, ' ').trim().slice(0, 600) || '(mô hình không tóm tắt)';

  function gather(job) {
    const summaries = db.prepare("SELECT dept_code AS dept, summary FROM ai_outputs WHERE run_id = ? AND kind IN ('work','fix') ORDER BY id").all(job.runId);
    const files = [];
    for (const f of listFiles(db, job.projectId)) {
      const r = readProjectFile({ db, root: dataDir, projectId: job.projectId, rel: f.path, maxBytes: 20000 });
      if (r) files.push({ path: f.path, deptCode: f.deptCode, content: r.content });
    }
    return { summaries, files };
  }

  async function docOrCode(job, proj) {
    const deps = TASKS.depends[job.productKind]?.[job.dept] || [];
    const g = gather(job);
    const context = contextBlock({ summaries: g.summaries, files: g.files, priority: deps });
    const { value } = await callJson(job, { kind: 'work', model: modelFor(job.dept), system: systemPrompt({ dept: job.dept, kind: job.productKind, rules: getRules() }), prompt: workPrompt({ dept: job.dept, kind: job.productKind, request: proj.request, context }) });
    const res = writeProjectFiles({ db, root: dataDir, projectId: job.projectId, deptCode: job.dept, files: value.files });
    if (!res.written.length) throw new AiError('badresponse', 'Mô hình không tạo ra tệp hợp lệ nào' + (res.rejected.length ? ` (${res.rejected[0].path}: ${res.rejected[0].reason})` : '') + '.');
    const summary = summaryOf(value);
    saveOutput(job, summary);
    return { summary, written: res.written, rejected: res.rejected };
  }

  const sanitizeFinding = (f, known) => {
    if (!f || typeof f.title !== 'string' || !f.title.trim()) return null;
    const file = typeof f.file === 'string' ? f.file.replace(/\\/g, '/').replace(/^\.\//, '') : null;
    const sev = SEVERITIES.includes(f.severity) ? f.severity : 'medium';
    const okFile = file && known.has(file) ? file : null;
    return { severity: sev, title: f.title.replace(/\s+/g, ' ').trim().slice(0, 120), detail: String(f.detail || '').slice(0, 400), file: okFile, dept: okFile ? known.get(okFile) : null, source: 'ai' };
  };
  const report = (title, summary, all) => `# ${title}\n\n${summary}\n\n## Phát hiện (${all.length})\n\n${all.length ? all.map((f, i) => `${i + 1}. **${f.title}** (${f.severity === 'high' ? 'nặng' : f.severity === 'medium' ? 'vừa' : 'nhẹ'})${f.file ? ` — tệp \`${f.file}\`` : ''}\n   ${f.detail}`).join('\n') : 'Không có vấn đề nào được phát hiện.'}\n`;

  // Gọi AI rà soát một lượt; lỗi tạm thời hoặc phản hồi hỏng thì bỏ lượt đó (kết quả kiểm tra tự động vẫn còn), còn lỗi khoá, giới hạn, dừng thì dừng hẳn.
  async function softReview(job, opts, known, limit) {
    try {
      const { value } = await callJson(job, { kind: 'work', model: modelFor('10'), ...opts });
      return { findings: (Array.isArray(value.findings) ? value.findings : []).slice(0, limit).map(f => sanitizeFinding(f, known)).filter(Boolean), note: summaryOf(value) };
    } catch (e) {
      if (!(e instanceof AiError) || !['blocked', 'badresponse', 'quota', 'server', 'network', 'timeout'].includes(e.kind)) throw e;
      return { findings: [], note: `AI không rà soát được mã (${e.message}); chỉ có kết quả kiểm tra tự động.`, failed: true };
    }
  }
  async function qaWork(job, proj) {
    const a = cfg(), limit = a.deepQa ? 5 : 3;
    const files = listFiles(db, job.projectId).filter(f => f.deptCode !== '10');
    const known = new Map(files.map(f => [f.path, f.deptCode]));
    const stat = runChecks({ root: projectDir(dataDir, job.projectId), files: files.filter(f => !f.path.startsWith('docs/')), kind: job.productKind }).map(f => ({ ...f, source: 'static' }));
    const g = gather(job), codeFiles = g.files.filter(f => !f.path.startsWith('docs/')), sys = systemPrompt({ dept: '10', kind: job.productKind, rules: getRules() });
    const logic = await softReview(job, { system: sys, prompt: reviewPrompt({ request: proj.request, found: stat, limit, focus: 'logic', context: contextBlock({ summaries: g.summaries, files: codeFiles, priority: ['06', '07', '08', '09'] }) }) }, known, limit);
    const notes = [logic.note]; let review = logic.findings;
    if (a.deepQa && !logic.failed) {                    // kiểm thử sâu: lượt thứ hai đối chiếu từng tính năng trong yêu cầu với mã
      const docs = g.files.filter(f => ['docs/02-pham-vi-san-pham.md', 'docs/03-yeu-cau-chi-tiet.md', 'docs/05-thiet-ke-giao-dien.md'].includes(f.path));
      const cov = await softReview(job, { system: sys, prompt: reviewPrompt({ request: proj.request, found: [...stat, ...review], limit, focus: 'coverage', context: contextBlock({ summaries: g.summaries, files: [...docs, ...codeFiles], priority: ['06', '07', '08', '09'] }) }) }, known, limit);
      review = [...review, ...cov.findings]; notes.push(cov.note);
    }
    const all = [], seen = new Set();
    for (const f of [...stat, ...review]) { const k = f.title.toLowerCase(); if (!seen.has(k)) { seen.add(k); all.push(f); } }
    const summary = `Kiểm tra tự động tìm ${stat.length} vấn đề, AI rà soát thêm ${review.length}${a.deepQa ? ' (kiểm thử sâu)' : ''}. ${notes.join(' ')}`.trim().slice(0, 600);
    const res = writeProjectFiles({ db, root: dataDir, projectId: job.projectId, deptCode: '10', files: [{ path: 'docs/10-bao-cao-kiem-thu.md', content: report('Báo cáo kiểm thử', summary, all) }] });
    saveOutput(job, summary);
    return { summary, written: res.written, rejected: res.rejected, findings: all.slice(0, limit), allFindings: all };
  }
  async function retestWork(job, proj) {
    const a = cfg();
    const files = listFiles(db, job.projectId).filter(f => f.deptCode !== '10' && !f.path.startsWith('docs/'));
    const known = new Map(listFiles(db, job.projectId).map(f => [f.path, f.deptCode]));
    let left = runChecks({ root: projectDir(dataDir, job.projectId), files, kind: job.productKind }).map(f => ({ ...f, source: 'static' }));
    let note = '';
    if (a.deepQa && job.priorBugs?.length) {            // kiểm thử sâu: nhờ AI đọc bản đã sửa xem lỗi cũ còn không (kiểm tra tĩnh không thấy được lỗi logic)
      const g = gather(job);
      const r = await softReview(job, { system: systemPrompt({ dept: '10', kind: job.productKind, rules: getRules() }),
        prompt: verifyPrompt({ request: proj.request, bugs: job.priorBugs, found: left, context: contextBlock({ summaries: g.summaries, files: g.files.filter(f => !f.path.startsWith('docs/')), priority: job.priorBugs.map(b => known.get(b.file)).filter(Boolean) }) }) }, known, 4);
      const seen = new Set(left.map(f => f.title.toLowerCase()));
      left = [...left, ...r.findings.filter(f => !seen.has(f.title.toLowerCase()))]; note = r.note;
    }
    const summary = (left.length ? `Kiểm lại: còn ${left.length} vấn đề.` : 'Kiểm lại: không thấy vấn đề nào.') + (note ? ' ' + note : '');
    const res = writeProjectFiles({ db, root: dataDir, projectId: job.projectId, deptCode: '10', files: [{ path: 'docs/10-bao-cao-kiem-thu-lai.md', content: report('Báo cáo kiểm thử lại', summary.slice(0, 600), left) }] });
    saveOutput(job, summary);
    return { summary, written: res.written, rejected: res.rejected, findings: left.slice(0, a.deepQa ? 5 : 3), allFindings: left };
  }
  async function fixWork(job, proj) {
    const g = gather(job);
    const context = contextBlock({ summaries: g.summaries, files: g.files.filter(f => !f.path.startsWith('docs/')), priority: [job.dept] });
    const { value } = await callJson(job, { kind: 'fix', model: modelFor(job.dept), system: systemPrompt({ dept: job.dept, kind: job.productKind, rules: getRules() }), prompt: fixPrompt({ dept: job.dept, kind: job.productKind, request: proj.request, bug: job.bug, context }) });
    const res = writeProjectFiles({ db, root: dataDir, projectId: job.projectId, deptCode: job.dept, files: value.files });
    if (!res.written.length) throw new AiError('badresponse', 'Mô hình không đưa ra bản sửa nào hợp lệ.');
    const summary = summaryOf(value);
    saveOutput(job, summary);
    return { summary, written: res.written, rejected: res.rejected };
  }

  // Một việc của một phòng. job: { runId, projectId, dept, itemId, kind: work|fix|retest, productKind, bug?, signal, onUsage }.
  async function execute(job) {
    const proj = db.prepare('SELECT request, title FROM projects WHERE id = ?').get(job.projectId);
    if (!proj) throw new AiError('request', 'Không tìm thấy dự án để làm.');
    let done; const dfd = new Promise(r => { done = r; });
    if (job.kind === 'work') pending.set(`${job.runId}:${job.dept}`, dfd);
    try {
      if (job.kind === 'work') for (const d of TASKS.depends[job.productKind]?.[job.dept] || []) { const p = pending.get(`${job.runId}:${d}`); if (p) await waitFor(p, job.signal); }
      if (job.kind === 'fix') return await fixWork(job, proj);
      if (job.dept === '10') return job.kind === 'retest' ? await retestWork(job, proj) : await qaWork(job, proj);
      return await docOrCode(job, proj);
    } finally { done(); setTimeout(() => { if (pending.get(`${job.runId}:${job.dept}`) === dfd) pending.delete(`${job.runId}:${job.dept}`); }, 1000).unref?.(); }
  }

  const ai = {
    enabled, execute, modelFor, guard,
    hasKey: p => !!secrets.get(p || cfg().provider),
    setKey: (key, p) => secrets.set(key, p || 'gemini'),
    removeKey: p => secrets.remove(p || 'gemini'),
    // Trước khi bắt đầu dự án AI thật: mọi nhà cung cấp đang được dùng (mặc định và theo phòng) phải có khoá.
    assertReady() {
      const a = cfg(), used = new Map([[resolve(a.model).provider, 'mặc định']]);
      for (const [dept, spec] of Object.entries(a.deptModels)) { const p = resolve(spec).provider; if (!used.has(p)) used.set(p, `phòng ${dept}`); }
      for (const spec of [a.model, ...Object.values(a.deptModels)]) { const r = resolve(spec); if (isPriced(r.provider) && !priceOf(spec, r)) throw new SimError(409, `Chưa có đơn giá cho mô hình "${spec}". Hãy nhập đơn giá ở Cài đặt (mục nâng cao) trước khi chạy dự án.`); }
      for (const [p, who] of used) if (!secrets.get(p)) throw new SimError(409, `Chưa có khoá API của ${PROVIDERS[p].label} (đang dùng cho ${who}). Hãy dán khoá ở Cài đặt hoặc đổi mô hình của phòng đó.`);
    },
    // Tắt khẩn cấp: huỷ mọi lời gọi đang chạy và đang chờ trong hàng đợi.
    kill(reason = 'Đã tắt AI.') { killCtl.abort(); killCtl = new AbortController(); limiter.flush(reason); emit('ai', { time: Date.now() }); },
    async test({ provider, model } = {}) {
      const a = cfg();
      if (provider != null && !PROVIDER_IDS.includes(provider)) throw new AiError('request', 'Nhà cung cấp AI không hợp lệ.');
      let spec = a.model;
      if (provider && provider !== resolve(a.model).provider) {
        if (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$/.test(model)) throw new AiError('request', `Hãy nhập tên mô hình của ${PROVIDERS[provider].label} để thử khoá.`);
        spec = `${provider}:${model}`;
      } else if (typeof model === 'string' && model) spec = model;
      const r = resolve(spec);
      const out = await call({ kind: 'test', signal: null }, { kind: 'test', model: spec, system: 'Bạn là trợ lý kiểm tra kết nối.', prompt: 'Trả lời đúng một từ: ok', json: false, maxTokens: 64 });
      return { ok: true, provider: r.provider, model: r.canon, ms: out.ms, tokensIn: out.tokensIn, tokensOut: out.tokensOut, text: String(out.text).slice(0, 40) };
    },
    status() {
      const a = cfg(), t = todayCalls(), s = limiter.stats();
      return {
        enabled: a.enabled, active: enabled(), provider: a.provider, hasKey: !!secrets.get(a.provider), keySource: secrets.source(a.provider), keyLast4: secrets.last4(a.provider),
        providers: Object.fromEntries(PROVIDER_IDS.map(p => [p, { label: PROVIDERS[p].label, hasKey: !!secrets.get(p), keySource: secrets.source(p), keyLast4: secrets.last4(p), freeTier: PROVIDERS[p].freeTier, keyUrl: PROVIDERS[p].keyUrl }])),
        tier: a.tier, model: a.model, deptModels: a.deptModels, prices: a.prices, rpm: a.rpm, dailyCalls: a.dailyCalls, maxTokens: a.maxTokens,
        today: { calls: t.n, tokensIn: t.ti, tokensOut: t.tp, cost: round6(t.c) }, queue: { queued: s.queued, running: s.running, waitingUntil: s.waitingUntil || null },
        lastError, simulatedWhenOff: true
      };
    },
    usage(projectId) {
      const r = db.prepare('SELECT COUNT(*) calls, COALESCE(SUM(ok), 0) ok, COALESCE(SUM(tokens_in), 0) ti, COALESCE(SUM(tokens_out), 0) tp, COALESCE(SUM(cost), 0) cost FROM ai_calls WHERE project_id = ?').get(projectId);
      const errors = db.prepare('SELECT created_at AS at, error FROM ai_calls WHERE project_id = ? AND ok = 0 ORDER BY id DESC LIMIT 5').all(projectId);
      return { calls: r.calls, ok: r.ok, tokensIn: r.ti, tokensOut: r.tp, cost: round6(r.cost), errors };
    },
    files: projectId => listFiles(db, projectId),
    readFile: (projectId, rel) => readProjectFile({ db, root: dataDir, projectId, rel }),
    dir: projectId => projectDir(dataDir, projectId),
    limiter
  };
  return ai;
}
