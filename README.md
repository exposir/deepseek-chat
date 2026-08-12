# DeepSeek Chat

移动优先的 DeepSeek 聊天 PWA：流式问答 + 思维链 + 服务端联网搜索。

**在线体验**: https://exposir.github.io/deepseek-chat/

## 特性

- **BYOK 纯前端**：填入自己的 API Key，浏览器直连所选服务，零后端、无中间服务器
  - **DeepSeek 官方**：直连 `api.deepseek.com`
  - **OpenCode**：通过自建 Cloudflare Worker 代理转发（`opencode.ai` 端点未配置浏览器 CORS，模板见 `examples/opencode-go-proxy.js`）
  - **自建代理**：任意自定义端点
  - 各服务的 Key 独立保存，切换服务自动跟随
- **流式输出**：基于 Responses API 的 SSE 流式渲染，Streamdown 处理未闭合 Markdown
- **思维链**：可折叠展示模型推理过程，思考强度可调（none / low / high / max）
- **联网搜索**：由 DeepSeek 服务端执行的 `web_search` 托管工具，带搜索状态提示
- **本地优先**：会话存于 IndexedDB，Key 存于 localStorage，均不上传
- **PWA**：可添加到手机主屏，iOS 安全区适配

## 隐私

API Key 仅保存在你的设备本地，只随请求发送至你选择的 API 服务端点（DeepSeek 官方 / 自建代理），不经过任何第三方服务器。自建代理由你自行部署，Key 从你的浏览器直达代理，再由代理转发至上游。

## 本地开发

```bash
npm install
npm run dev      # 开发服务器
npm test         # 单元测试
npm run build    # 生产构建
```

## 技术栈

Vite · React · TypeScript · Tailwind CSS v4 · zustand · Dexie · Streamdown · vite-plugin-pwa
