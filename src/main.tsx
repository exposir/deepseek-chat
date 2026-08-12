import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useSettings } from './store/settings';
import { consumeUrlApiKey } from './utils/urlKey';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// 首帧前同步主题，避免闪屏（zustand persist 存储于 localStorage）
try {
  const saved = JSON.parse(localStorage.getItem('ds-chat-settings') ?? '{}') as {
    state?: { theme?: string };
  };
  if (saved.state?.theme) document.documentElement.dataset.theme = saved.state.theme;
} catch {
  // 忽略解析失败
}

// URL ?apiKey=xxx：同步写入 settings，保证首帧 key 已生效（consumeUrlApiKey 幂等并立即清理地址栏）
const urlKey = consumeUrlApiKey();
if (urlKey) useSettings.getState().setApiKey(urlKey);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
