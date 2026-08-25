import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';
import { getDb, nowIso } from './db/connection.js';
import { loadConfig, UPLOAD_DIR, ROOT, APP_VERSION, BACKUP_DIR } from './config.js';
import { writeRateLimit } from './utils/ratelimit.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerStudentRoutes } from './routes/students.js';
import { registerTeacherRoutes } from './routes/teacher.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerSyncRoutes } from './routes/sync.js';
import { requireAuth } from './middleware.js';
import { logger } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// —— 浏览器心跳/自动停止状态（仅在 start.exe 拉起、且收到心跳后启用）——
let lastHeartbeatAt = 0;
let heartbeatStarted = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const HEARTBEAT_TIMEOUT_MS = 30_000; // 无心跳超过 30s 判定浏览器已关闭

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  // 写操作限流（全局：每 IP 每分钟 120 次变更，防滥用/防爆破）
  app.use('/api', writeRateLimit(120, 60_000));

  // CORS（开发模式前端在 5173）
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // 启动时确保 schema 与种子
  migrate();
  seed();

  app.get('/api/health', (_req, res) => {
    app.get('/api/health', (_req, res) => {
      let dbOk = false;
      try {
        dbOk = getDb().prepare('SELECT 1 AS ok').get()?.ok === 1;
      } catch {
        dbOk = false;
      }
      let diskFreeMB: number | null = null;
      try {
        diskFreeMB = Math.round(fs.statfsSync(path.resolve(ROOT)).bavail * (fs.statfsSync(path.resolve(ROOT)).bsize || 4096) / 1024 / 1024);
      } catch {
        diskFreeMB = null;
      }
      res.json({
        ok: dbOk,
        version: APP_VERSION,
        time: nowIso(),
        uptime: Math.round(process.uptime()),
        db: dbOk ? 'ok' : 'error',
        diskFreeMB,
      });
    });
    res.json({ ok: true, version: APP_VERSION, time: nowIso() });
  });

  app.get('/api/meta/bootstrap', (_req, res) => {
    const db = getDb();
    const cfg = loadConfig();
    const firstRun = db
      .prepare(`SELECT value FROM settings WHERE key = 'first_run_done'`)
      .get() as { value: string } | undefined;
    res.json({
      firstRunDone: !!firstRun,
      syncMode: cfg.supabaseUrl ? 'supabase' : 'mock',
      giteeEnabled: !!cfg.giteeEnabled,
      appVersion: APP_VERSION,
    });
  });

  // 浏览器心跳：前端 App 周期性调用；配合 start.exe 的"浏览器关闭→后端自动结束"。
  // 仅当由启动器拉起（PET_PORT 存在）且已收到过一次心跳后才启用自动停止。
  if (process.env.PET_PORT) {
    app.post('/api/heartbeat', (_req, res) => {
      lastHeartbeatAt = Date.now();
      if (!heartbeatStarted) {
        heartbeatStarted = true;
        // 首次心跳后启动"失联检测"：超过阈值（默认 30s）无心跳则结束服务。
        if (!heartbeatTimer) {
          heartbeatTimer = setInterval(() => {
            if (heartbeatStarted && Date.now() - lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
              console.log('[heartbeat] 长时间未收到浏览器心跳，服务自动停止。');
              process.exit(0);
            }
          }, 5000);
          heartbeatTimer.unref?.();
        }
      }
      res.json({ ok: true });
    });
  }

  // 上传文件
  app.use('/uploads', express.static(UPLOAD_DIR));

  // 业务路由
  registerAuthRoutes(app);
  registerStudentRoutes(app, requireAuth);
  registerTeacherRoutes(app, requireAuth);
  registerAdminRoutes(app, requireAuth);
  registerSyncRoutes(app, requireAuth);

  // 生产模式：托管前端构建产物
  const clientDist = path.resolve(ROOT, '../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  // PET_PORT 优先：start.exe 已选好可用端口；其次 PORT；最后默认 3000
  const PORT = Number(process.env.PET_PORT) || Number(process.env.PORT) || 3000;
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[pet-campus] server ready  http://localhost:${PORT}`);
    console.log(`[pet-campus] version ${APP_VERSION}  (health: /api/health)`);

    // 启动自检：数据库完整性 / 配置完整性 / 备份目录
    setTimeout(() => {
      try {
        const db = getDb();
        const ic = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
        console.log(`[selfcheck] 数据库完整性: ${ic.integrity_check}`);
      } catch (e) {
        console.error('[selfcheck] 数据库完整性检查失败:', e);
      }
      const cfg = loadConfig();
      if (cfg.supabaseUrl && !cfg.supabaseServiceKey) {
        console.warn('[selfcheck] ⚠ Supabase 已配置项目地址但缺少 Service Role Key：只读可用，写入/同步不可用');
      } else if (cfg.supabaseServiceKey && !cfg.supabaseUrl) {
        console.warn('[selfcheck] ⚠ 已配置 Service Key 但缺少项目地址');
      }
      if (!cfg.supabaseUrl) console.log('[selfcheck] 当前为本地模式（未配置云端）');
      try {
        fs.accessSync(BACKUP_DIR, fs.constants.W_OK);
        console.log('[selfcheck] 备份目录可写 ✓');
      } catch {
        console.warn('[selfcheck] ⚠ 备份目录不可写，请检查权限');
      }
      console.log('[selfcheck] 启动自检完成');
    }, 400);
  });
}