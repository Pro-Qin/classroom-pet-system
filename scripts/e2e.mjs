/* 校园宠物系统 · 浏览器端到端测试（驱动系统 Edge，无头） */
/* 用法：node scripts/e2e.mjs（需服务已在 localhost:3000 运行，且为首次运行/干净库） */
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3000';
const results = [];
const consoleErrors = [];
const failedRequests = [];
let step = 0;

function log(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${String(++step).padStart(2, '0')}] ${name}  ${detail}`);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('requestfailed', (req) =>
  failedRequests.push(`${req.method()} ${req.url()} → ${req.failure()?.errorText}`)
);
page.on('response', (res) => {
  if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ---------- 1. 访问首页：App 启动引导（首次→欢迎向导；已初始化→准备界面→登录） ----------
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await wait(600);
  log('启动引导页', /\/welcome|\/prep/.test(page.url()), page.url());

  // ---------- 2. 首次运行：欢迎向导（Supabase 留空 = 自动离线） ----------
  if (page.url().includes('/welcome')) {
    log('欢迎页渲染', await page.getByText('欢迎来到校园宠物乐园').isVisible().catch(() => false));
    await page.getByRole('button', { name: '开始配置' }).click();
    await wait(400);
    await page.getByRole('button', { name: '下一步' }).click(); // 云端配置留空
    await wait(400);
    await page.locator('input[placeholder="例如：电教委员 / 班主任"]').fill('测试管理员');
    await page.locator('input[placeholder="••••••"]').fill('admin888');
    await page.locator('input[placeholder="再次输入"]').fill('admin888');
    await page.getByRole('button', { name: '完成配置' }).click();
    await wait(2600);
    log('向导完成 → 准备界面', page.url().includes('/prep'), page.url());
  }

  // ---------- 3. 准备界面：更新检查 + 同步 + 进入登录 ----------
  if (page.url().includes('/prep')) {
    log('离线模式徽章显示', await page.getByText('离线模式').isVisible().catch(() => false));
    await page.waitForSelector('text=进入登录', { timeout: 15000 }).catch(() => {});
    await wait(800);
    const prepReady = await page.getByRole('button', { name: '进入登录' }).isEnabled().catch(() => false);
    log('准备界面同步完成可进登录', prepReady);
    await page.getByRole('button', { name: '进入登录' }).click();
    await wait(800);
  }
  log('进入登录页', page.url().includes('/login'), page.url());

  // ---------- 4. 学生系统：列表 → 详情 ----------
  const studentCards = await page.locator('button:has-text("林小满"), button:has-text("周子昂")').count();
  log('学生列表展示', studentCards >= 2, `count=${studentCards}`);
  await page.locator('button:has-text("林小满")').first().click();
  await wait(1000);
  log('进入学生详情', page.url().includes('/students/'), page.url());
  log('宠物卡片渲染', await page.getByText('的宠物').first().isVisible().catch(() => false));
  log('积分记录区块', await page.getByText('积分记录').isVisible().catch(() => false));

  // ---------- 5. 教师系统 ----------
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await wait(500);
  await page.locator('button:has-text("教师系统")').first().click();
  await wait(300);
  await page.locator('input[type="password"]').fill('123456');
  await page.getByRole('button', { name: '进入教师系统' }).click();
  await wait(1000);
  log('教师系统进入', page.url().includes('/teacher'), page.url());
  log('教师端统计卡片', await page.getByText('学生总数').isVisible().catch(() => false));
  await page.getByRole('button', { name: /排行榜/ }).click();
  await wait(600);
  log('教师端排行榜', await page.getByText('名次').isVisible().catch(() => false));

  // ---------- 6. 管理系统 ----------
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await wait(500);
  await page.locator('button:has-text("管理系统")').first().click();
  await wait(300);
  await page.locator('input[type="password"]').fill('admin888');
  await page.getByRole('button', { name: '进入管理系统' }).click();
  await wait(1000);
  log('管理系统进入', page.url().includes('/admin'), page.url());
  log('管理端概览（同步状态）', await page.getByText('同步状态').isVisible().catch(() => false));

  // ---------- 7. 大屏模式 ----------
  await page.goto(BASE + '/screen', { waitUntil: 'networkidle' });
  await wait(1000);
  log('大屏模式加载', await page.getByText('班级荣誉榜').isVisible().catch(() => false));
  await wait(11000); // 等一次轮播
  log('大屏自动轮播到宠物墙', await page.getByText('全体宠物').isVisible().catch(() => false));

  // ---------- 8. 教师系统内无离线按钮（用户要求） ----------
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await wait(500);
  await page.locator('button:has-text("教师系统")').first().click();
  await page.locator('input[type="password"]').fill('123456');
  await page.getByRole('button', { name: '进入教师系统' }).click();
  await wait(800);
  const offlineBtnInTeacher = await page.getByText('离线模式').count();
  log('教师系统无离线模式按钮', offlineBtnInTeacher === 0, `count=${offlineBtnInTeacher}`);
} catch (e) {
  log('E2E 执行异常', false, String(e).slice(0, 200));
}

const realErrors = consoleErrors.filter((t) => !t.includes('favicon') && !t.includes('DevTools'));
log('控制台无错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
const badReqs = failedRequests.filter((u) => !u.includes('favicon'));
log('无 4xx/5xx 或失败请求', badReqs.length === 0, badReqs.slice(0, 5).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n==== ${results.length - failed}/${results.length} 项通过 ====`);
process.exitCode = failed > 0 ? 1 : 0;
