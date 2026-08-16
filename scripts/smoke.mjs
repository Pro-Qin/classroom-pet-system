/* 全流程冒烟测试（生产模式，localhost:3000） */
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
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
}

const tLogin = await j('/api/auth/login', { method: 'POST', body: JSON.stringify({ role: 'teacher', password: '123456' }) });
check('教师登录', tLogin.status === 200 && !!tLogin.data.token, `status=${tLogin.status}`);
const T = tLogin.data.token;

const aLogin = await j('/api/auth/login', { method: 'POST', body: JSON.stringify({ role: 'admin', password: 'admin888' }) });
let A = aLogin.data.token;
if (aLogin.status === 409) {
  // 首次运行：先执行欢迎向导配置
  await j('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ adminPassword: 'admin888', adminName: '电教委员', supabaseUrl: '', supabaseAnonKey: '', supabaseServiceKey: '' }),
  });
  const retry = await j('/api/auth/login', { method: 'POST', body: JSON.stringify({ role: 'admin', password: 'admin888' }) });
  check('管理员登录(向导后)', retry.status === 200 && !!retry.data.token, `status=${retry.status}`);
  A = retry.data.token;
} else {
  check('管理员登录', aLogin.status === 200 && !!aLogin.data.token, `status=${aLogin.status}`);
}
const H = (t) => ({ Authorization: `Bearer ${t}` });

let r = await j('/api/admin/presets', { method: 'POST', headers: H(A), body: JSON.stringify({ label: '黑板报加分', delta: 8, reason: '完成黑板报' }) });
check('管理端新增快捷理由', r.status === 200 && r.data.ok, `status=${r.status}`);

r = await j('/api/admin/students', { method: 'POST', headers: H(A), body: JSON.stringify({ name: '测试学生', studentNo: `T${Date.now() % 1000000}`, className: '高一(2)班', points: 100, petSpeciesId: 'unicorn', petName: '小梦' }) });
check('管理端新增学生(带宠物)', r.status === 200 && !!r.data.petId, `petId=${r.data.petId}`);
const testStuId = r.data.id;

r = await j('/api/admin/students/import', { method: 'POST', headers: H(A), body: JSON.stringify({ students: [{ name: '导入甲', studentNo: 'I' + (Date.now() % 100000000), className: '高一(2)班', points: 12 }, { name: '导入乙', studentNo: 'I' + (Date.now() % 100000000 + 1), className: '高一(2)班', points: 30 }] }) });
check('批量导入', r.status === 200 && r.data.added === 2, `added=${r.data.added}`);

r = await j('/api/points', { method: 'POST', headers: H(T), body: JSON.stringify({ studentIds: ['s_demo1', 's_demo2'], delta: 15, reason: '期中表彰' }) });
check('批量加减分(事务)', r.status === 200 && r.data.applied === 2 && r.data.totalDelta === 30, `applied=${r.data.applied}`);

r = await j('/api/admin/items', { method: 'POST', headers: H(A), body: JSON.stringify({ id: 'candy' + (Date.now() % 100000), name: '糖果', type: 'food', cost: 5, effect: { happy: 10 }, desc: '心情+10' }) });
check('管理端新增道具', r.status === 200 && r.data.ok, `status=${r.status}`);

r = await j('/api/students/s_demo1');
check('学生详情(宠物/状态/阶段)', r.status === 200 && r.data.pet && r.data.pet.state && r.data.pet.stageLabel, `state=${r.data.pet?.state?.label} stage=${r.data.pet?.stageLabel}`);

r = await j('/api/presets', { headers: H(T) });
check('快捷理由列表', r.status === 200 && (r.data.presets?.length ?? 0) >= 7, `count=${r.data.presets?.length ?? 0}`);

r = await j('/api/updates/check');
check('更新检查(公开,离线无 4xx)', r.status === 200 && typeof r.data.hasUpdate === 'boolean', `status=${r.status} hasUpdate=${r.data.hasUpdate} note=${r.data.note ?? ''}`);

r = await j('/api/sync/run', { method: 'POST', headers: H(T) });
check('两路同步(快照/推送)', r.status === 200 && r.data.completed === true, `pushed=${r.data.pushed} backup=${!!r.data.backup}`);

r = await j('/api/leaderboard', { headers: H(T) });
check('排行榜', r.status === 200 && r.data.rows.length >= 6 && r.data.rows[0].rank === 1, `top=${r.data.rows[0]?.name}`);

r = await j('/api/pets/all');
check('大屏宠物墙数据', r.status === 200 && r.data.pets.length >= 6, `pets=${r.data.pets.length}`);

r = await j(`/api/students/${testStuId}/pet/buy-item`, { method: 'POST', body: JSON.stringify({ itemId: 'apple' }) });
check('积分购买道具', r.status === 200 && r.data.ok, `points=${r.data.points}`);

r = await j(`/api/students/${testStuId}/pet/use-item`, { method: 'POST', body: JSON.stringify({ itemId: 'apple' }) });
check('使用道具(属性联动)', r.status === 200 && r.data.ok && r.data.pet.hungry > 100 - 20, `hungry=${r.data.pet?.hungry}`);

const failed = results.filter((x) => !x.ok).length;
console.log(`\n==== ${results.length - failed}/${results.length} 项通过 ====`);
if (failed > 0) process.exitCode = 1;
