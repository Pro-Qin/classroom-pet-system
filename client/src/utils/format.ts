/** 经验展示：最多 1 位小数（整数不带小数点） */
export function fmtExp(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** 整数积分展示：千分位分组；超过 1e15 视为数据异常显示"爆表" */
export function fmtInt(n: number | null | undefined): string {
  const v = Math.round(Number(n ?? 0));
  if (!Number.isFinite(v)) return '0';
  if (Math.abs(v) >= 1e15) return '爆表';
  return v.toLocaleString('zh-CN');
}
