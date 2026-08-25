import { ref } from 'vue';
import { api } from '../api';

export type CopyVibe = 'formal' | 'playful';
export type Screen = 'welcome' | 'student' | 'admin';

const styles = ref<Record<Screen, CopyVibe>>({ welcome: 'formal', student: 'formal', admin: 'formal' });
let loaded = false;

/** 拉取三区界面文案风格（懒加载，带缓存）。未加载成功时默认全正式。 */
export function useCopyStyles() {
  if (!loaded) {
    loaded = true;
    api<Record<Screen, CopyVibe>>('/ui/vibe')
      .then((r) => {
        styles.value = { ...styles.value, ...r };
      })
      .catch(() => {
        /* 保持默认正式 */
      });
  }
  return styles;
}

/** 取某一界面的当前风格。 */
export function vibe(screen: Screen): CopyVibe {
  return styles.value[screen] ?? 'formal';
}

/** 按风格在两套文案里选一套。 */
export function pick(screen: Screen, copy: { formal: string; playful: string }): string {
  return vibe(screen) === 'playful' ? copy.playful : copy.formal;
}
