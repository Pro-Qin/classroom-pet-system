/* 安全加固行为验证（服务已运行） */
const BASE = 'http://localhost:3000';
async function j(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`); };

// 测试会临时写入 sync 配置；先备份，结束时恢复（保证可重复运行且不污染真实配置）
const fs = await import('node:fs');
const CFG = 'server/data/config.json';
const savedCfg = fs.existsSync(CFG) ? fs.readFileSync(CFG, 'utf-8') : null;
const restoreCfg = () => { if (savedCfg !== null) fs.writeFileSync(CFG, savedCfg); };
process.on('exit', restoreCfg);

// 1. 已初始化后，无 token 的 setup 必须被拒绝
let r = await j('/api/auth/setup', { method: 'POST', body: JSON.stringify({ adminPassword: 'hacked' }) });
check('setup 未鉴权重设被拒', r.status === 403, `status=${r.status} ${r.data.error ?? ''}`);

// 2. 教师 token 不能改同步配置（管理员专属）
const t = (await j('/api/auth/login', { method: 'POST', body: JSON.stringify({ role: 'teacher', password: '123456' }) })).data.token;
r = await j('/api/sync/config', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: JSON.stringify({ supabaseUrl: 'https://evil.example.com' }) });
check('教师不可改同步配置', r.status === 403, `status=${r.status}`);

// 3. 管理员提交非法 supabase 域名被拒
const a = (await j('/api/auth/login', { method: 'POST', body: JSON.stringify({ role: 'admin', password: 'admin888' }) })).data.token;
r = await j('/api/sync/config', { method: 'POST', headers: { Authorization: `Bearer ${a}` }, body: JSON.stringify({ supabaseUrl: 'https://evil.example.com' }) });
check('非法 Supabase 域名被拒', r.status === 400, `status=${r.status} ${r.data.error ?? ''}`);

// 4. 合法域名接受
r = await j('/api/sync/config', { method: 'POST', headers: { Authorization: `Bearer ${a}` }, body: JSON.stringify({ supabaseUrl: 'https://abc123.supabase.co', supabaseAnonKey: 'k', supabaseServiceKey: 's' }) });
check('合法 Supabase 域名接受', r.status === 200 && r.data.mode === 'supabase', `status=${r.status} mode=${r.data.mode}`);

// 5. 登录失败限流：连续 12 次错误应触发 429
let limited = false;
for (let i = 0; i < 12; i++) {
  const rr = await j('/api/auth/login', { method: 'POST', body: JSON.stringify({ role: 'admin', password: 'wrong-password' }) });
  if (rr.status === 429) { limited = true; break; }
}
check('登录失败限流生效', limited === true, `limited=${limited}`);

const failed = results.filter((x) => !x).length;
restoreCfg();
console.log(`\n==== ${results.length - failed}/${results.length} 安全项通过 ====`);
if (failed > 0) process.exitCode = 1;
