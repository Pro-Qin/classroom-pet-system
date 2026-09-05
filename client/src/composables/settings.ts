import { ref } from 'vue';
import { api } from '../api';

const pointsUnit = ref('积分');
const gitee = ref({ enabled: false, repo: '' });
const anomalyEffect = ref(false);
let loaded = false;

/** 全局系统设置（懒加载；未登录时取默认值） */
export function useSettings() {
  if (!loaded) {
    loaded = true;
    api<{ pointsUnit: string; giteeEnabled: boolean; giteeRepo: string; anomalyEffect?: boolean }>('/admin/settings')
      .then((r) => {
        pointsUnit.value = r.pointsUnit || '积分';
        gitee.value = { enabled: !!r.giteeEnabled, repo: r.giteeRepo || '' };
        anomalyEffect.value = !!r.anomalyEffect;
      })
      .catch(() => {
        /* 未登录：保持默认 */
      });
  }
  return { pointsUnit, gitee, anomalyEffect };
}
