# DeepSeek Chat

移动优先的 DeepSeek 聊天 PWA：流式问答 + 思维链 + 服务端联网搜索。

**在线体验**: https://exposir.github.io/deepseek-chat/

## 特性

- **BYOK 纯前端**：填入自己的 DeepSeek API Key，浏览器直连 `api.deepseek.com`，零后端、无中间服务器
- **流式输出**：基于 Responses API 的 SSE 流式渲染，Streamdown 处理未闭合 Markdown
- **思维链**：可折叠展示模型推理过程，思考强度可调（none / low / high / max）
- **联网搜索**：由 DeepSeek 服务端执行的 `web_search` 托管工具，带搜索状态提示
- **本地优先**：会话存于 IndexedDB，Key 存于 localStorage，均不上传
- **PWA**：可添加到手机主屏，iOS 安全区适配

## 隐私

API Key 仅保存在你的设备本地，只随请求发送至 `api.deepseek.com`。页面 CSP 将 `connect-src` 限制为该域名，从机制上杜绝密钥外发。

## 本地开发

```bash
npm install
npm run dev      # 开发服务器
npm test         # 单元测试
npm run build    # 生产构建
```

## 技术栈

Vite · React · TypeScript · Tailwind CSS v4 · zustand · Dexie · Streamdown · vite-plugin-pwa
