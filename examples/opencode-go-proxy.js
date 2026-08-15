// OpenCode Go 转发代理（Cloudflare Worker）
// 用途：OpenCode Go 的 /responses 端点未配置浏览器 CORS，无法从网页直连。
// 部署：https://dash.cloudflare.com → Workers & Pages → 创建 Worker → 粘贴本文件 → 部署
// 部署后把 Worker 地址（如 https://opencode-go-proxy.你的用户名.workers.dev）填到
// 本应用设置页「API 服务 → 自建代理」的输入框中。
//
// 可选环境变量（Worker 设置 → 变量）：
//   UPSTREAM_BASE = https://opencode.ai/zen/go/v1   （默认同上）
//   ALLOWED_ORIGIN = *  ← 默认放行所有源。⚠️ 任何网站都能借用该 Worker 转发请求到
//                        OpenCode 上游（消耗你的订阅额度、可能触发上游风控封禁）。
//                        生产环境务必改为你的站点域名，例如 https://exposir.github.io

const UPSTREAM_BASE = 'https://opencode.ai/zen/go/v1';
const ALLOWED_ORIGIN = '*';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    // 预检直接放行
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    // 路径原样转发到上游（/responses、/models 等），忽略 Worker 自身的路径前缀
    const upstreamUrl = UPSTREAM_BASE + url.pathname + url.search;

    const headers = new Headers(request.headers);
    headers.set('Host', new URL(UPSTREAM_BASE).host);

    const resp = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      // GET/HEAD 不带 body；其余透传流（SSE 流式响应同样透传）
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });

    const out = new Response(resp.body, resp);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      out.headers.set(k, v);
    }
    return out;
  },
};
