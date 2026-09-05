import { reactive } from 'vue';
import { getLocalSetting } from './useLocalSettings';
import { api } from '../api';

/**
 * 宠物头像“异常/差色特效”全局开关（默认关闭）。
 * 生效逻辑：本机设置(anomalyEffect) 或 管理端设置(anomaly_effect) 任一开启即显示。
 * 开启时给 <html> 加 .anomaly-on，CSS 只在 .anomaly-on 下启动画，避免 GPU 空闲仍拉满。
 */
const state = reactive({ on: false });
let started = false;

function apply(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('anomaly-on', state.on);
}

async function refresh(): Promise<void> {
  const local = getLocalSetting('anomalyEffect', false);
  let server = false;
  try {
    const r = await api<{ anomalyEffect?: boolean }>('/admin/settings');
    server = !!r.anomalyEffect;
  } catch {
    /* 未登录/离线：只按本机设置 */
  }
  state.on = local || server;
  apply();
}

/** 返回响应式状态（供 App 全局监听 / 设置页即时刷新）。 */
export function useAnomaly(): { on: typeof state.on; refresh: () => Promise<void> } {
  if (!started) {
    started = true;
    void refresh();
  }
  return { on: state.on, refresh };
}
