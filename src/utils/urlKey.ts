/**
 * 幂等消费 URL 上的 ?apiKey= 参数：
 * 首次调用读取并立即从地址栏清除（防 key 留在历史/分享链接/截图），
 * 后续调用返回缓存值（StrictMode 双挂载安全）。
 */
let cached: string | null | undefined;

export function consumeUrlApiKey(): string | null {
  if (cached !== undefined) return cached;
  const key = new URLSearchParams(window.location.search).get('apiKey')?.trim() || null;
  cached = key;
  if (key) {
    const search = window.location.search.replace(/[?&]apiKey=[^&]*/g, '');
    const clean = window.location.pathname + (search.startsWith('&') ? '?' + search.slice(1) : search);
    window.history.replaceState({}, '', clean);
  }
  return cached;
}
