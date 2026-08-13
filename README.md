# DeepSeek Chat

移动优先的 DeepSeek 聊天 PWA：流式问答 + 思维链 + 服务端联网搜索。

**在线体验**: https://exposir.github.io/deepseek-chat/

## 特性

- **BYOK 纯前端**：填入自己的 API Key，浏览器直连所选服务，零后端、无中间服务器
  - **DeepSeek 官方**：直连 `api.deepseek.com`
  - **OpenCode**：通过自建 Cloudflare Worker 代理转发（`opencode.ai` 端点未配置浏览器 CORS，模板见 `examples/opencode-go-proxy.js`）
  - **自建代理**：任意自定义端点
  - 各服务的 Key 独立保存，切换服务自动跟随
- **流式输出**：基于 Responses API 的 SSE 流式渲染，Streamdown 处理未闭合 Markdown；兼容标准与简化事件流（如 OpenCode Go pro 直发 delta 的流格式）
- **思维链**：可折叠展示模型推理过程，思考强度可调（none / low / high / max）
- **联网搜索**：服务端 `web_search` 托管工具，带搜索状态提示；不支持的模型（如 OpenCode Go 的 V4 Pro）自动禁用并提示
- **消息能力**：编辑重发、失败重试、最后一条回复重新生成、按会话保存输入草稿、消息时间戳
- **自动标题**：首轮及每 5 轮用对话内容渐进演化会话标题（可手动重命名锁定）
- **版本更新提示**：PWA 新版本就绪时提示一键更新
- **本地优先**：会话存于 IndexedDB，Key 存于 localStorage，均不上传
- **PWA**：可添加到手机主屏，iOS 安全区适配

## 隐私

API Key 仅保存在你的设备本地，只随请求发送至你选择的 API 服务端点（DeepSeek 官方 / 自建代理），不经过任何第三方服务器。

- **DeepSeek 官方**：直连 `api.deepseek.com`，CSP 白名单该域名。
- **OpenCode / 自建代理**：请求发往你填写的代理端点（如自建 Cloudflare Worker），再由代理转发上游。**你的 Key 会经过该代理**，因此请只使用自己部署或信任的代理，建议将 Worker 的 `ALLOWED_ORIGIN` 收紧为你自己的域名（模板见 `examples/opencode-go-proxy.js`）。

## 本地开发

```bash
npm install
npm run dev      # 开发服务器
npm test         # 单元测试
npm run build    # 生产构建
```

## 技术栈

Vite · React · TypeScript · Tailwind CSS v4 · zustand · Dexie · Streamdown · vite-plugin-pwa
