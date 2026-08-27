import { reactive } from 'vue';

/**
 * 全局「撤回」状态：
 * 教师端每次可撤回操作（积分加减等）成功后，把描述写入这里；
 * 底部右侧的撤回按钮据此点亮；无动作或超过 TTL 自动灰掉。
 */
export interface UndoableAction {
  /** 按钮上显示的文案，如「撤销给张三 +5」 */
  label: string;
  /** 需要冲正的积分流水 id（一次操作可能影响多名学生） */
  eventIds: string[];
  at: number;
}

const UNDO_TTL = 10 * 60_000;

interface UndoState {
  action: UndoableAction | null;
}

export const undoState = reactive<UndoState>({ action: null });

let timer: ReturnType<typeof setInterval> | null = null;

function ensureTicker(): void {
  if (timer) return;
  timer = setInterval(() => {
    const a = undoState.action;
    if (a && Date.now() - a.at > UNDO_TTL) undoState.action = null;
    // 全员空闲且无待撤回时停表
    if (!undoState.action && timer) {
      clearInterval(timer);
      timer = null;
    }
  }, 15_000);
}

/** 记录一次可撤回操作（覆盖上一条：撤回按钮只针对最近一次） */
export function pushUndoable(label: string, eventIds: string[]): void {
  undoState.action = { label, eventIds, at: Date.now() };
  ensureTicker();
}

/** 用完即清（冲正完成后调用） */
export function clearUndoable(): void {
  undoState.action = null;
}

export function isUndoExpired(): boolean {
  const a = undoState.action;
  return !a || Date.now() - a.at > UNDO_TTL;
}
