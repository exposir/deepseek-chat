/** 会话标题：取首条消息截断 */
export function truncateTitle(text: string, max = 20): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

/** 会话列表时间：今天显示 HH:mm，否则 M月d日 */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** token 数量缩写：1.2k / 3.4M */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** 金额：不足 1 分显示 0.01，其余保留两位小数 */
export function formatCost(yuan: number): string {
  if (yuan < 0.01) return '0.01';
  return yuan.toFixed(2);
}
