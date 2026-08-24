import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles/main.css';

createApp(App).use(router).mount('#app');

// ---------- 前端错误上报（一体机远程排查） ----------
let lastErrorAt = 0;
function reportError(level: 'error' | 'warning', message: string, stack = '', source = ''): void {
  const now = Date.now();
  if (now - lastErrorAt < 30_000) return;
  lastErrorAt = now;
  try {
    fetch('/api/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        message: String(message).slice(0, 1000),
        stack: String(stack).slice(0, 4000),
        source,
        url: location.href,
        info: { ua: navigator.userAgent },
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
}
window.addEventListener('error', (e) => reportError('error', e.message, e.error?.stack || '', e.filename || 'window.error'));
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason as Error | string | undefined;
  reportError('error', (reason as Error)?.message || String(reason || '未处理的 Promise 异常'), (reason as Error)?.stack || '');
});

// PWA：生产环境注册 Service Worker（离线缓存应用壳）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* 忽略：不影响使用 */
    });
  });
}