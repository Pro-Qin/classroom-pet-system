import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';
import { getDb, nowIso } from './db/connection.js';
import { loadConfig, UPLOAD_DIR, ROOT, APP_VERSION } from './config.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerStudentRoutes } from './routes/students.js';
import { registerTeacherRoutes } from './routes/teacher.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerSyncRoutes } from './routes/sync.js';
import { requireAuth } from './middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

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
  const PORT = Number(process.env.PORT) || 3000;
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[pet-campus] server ready  http://localhost:${PORT}`);
    console.log(`[pet-campus] version ${APP_VERSION}  (health: /api/health)`);
  });
}
