import { ref } from 'vue';

const KEY = 'pet_local_settings_v1';

export interface LocalSettings {
  kioskInterval: number;
  heartbeatTimeoutSec: number;
  autoStart: boolean;
  logToFile: boolean;
  logCapMB: number;
}

const defaults: LocalSettings = { kioskInterval: 10, heartbeatTimeoutSec: 120, autoStart: false, logToFile: true, logCapMB: 1024 };

const state = ref<LocalSettings>({ ...defaults });
let loaded = false;

/** 读取某个本机设置（localStorage，绝不发往服务器）。 */
export function getLocalSetting<T>(key: keyof LocalSettings, def?: T): T {
  if (!loaded) { load(); }
  return (state.value[key] as T) ?? (def as T);
}

/** 读整个本机设置对象。 */
export function getLocalSettings(): LocalSettings {
  if (!loaded) { load(); }
  return { ...state.value };
}

/** 保存本机设置。 */
export function saveLocalSettings(patch: Partial<LocalSettings>): void {
  if (!loaded) { load(); }
  Object.assign(state.value, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(state.value));
  } catch { /* ignore */ }
}

function load(): void {
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const o = JSON.parse(raw) as Partial<LocalSettings>;
    state.value = { ...defaults, ...o };
  } catch { /* keep defaults */ }
}
