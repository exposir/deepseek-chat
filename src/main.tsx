import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
