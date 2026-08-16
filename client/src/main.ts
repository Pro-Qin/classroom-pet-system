import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles/main.css';

createApp(App).use(router).mount('#app');

// PWA：生产环境注册 Service Worker（离线缓存应用壳）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* 忽略：不影响使用 */
    });
  });
}