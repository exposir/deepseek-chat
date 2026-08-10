import { useEffect, useState } from 'react';
import { useChat } from './store/chat';
import { useSettings } from './store/settings';
import { ConversationDrawer } from './components/ConversationDrawer';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { SettingsPage } from './components/SettingsPage';

export default function App() {
  const init = useChat((s) => s.init);
  const setDrawerOpen = useChat((s) => s.setDrawerOpen);
  const drawerOpen = useChat((s) => s.drawerOpen);
  const conversations = useChat((s) => s.conversations);
  const activeConvId = useChat((s) => s.activeConvId);
  const error = useChat((s) => s.error);
  const clearError = useChat((s) => s.clearError);
  const apiKey = useSettings((s) => s.apiKey);
  const model = useSettings((s) => s.model);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  // 首次进入无 Key 时引导至设置页
  useEffect(() => {
    if (!apiKey) setShowSettings(true);
    // 仅初始化时判断一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 视口在桌面/移动间切换时同步 sidebar 状态（桌面常驻、移动收起）
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setDrawerOpen(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setDrawerOpen]);

  const activeTitle = conversations.find((c) => c.id === activeConvId)?.title ?? 'DeepSeek Chat';
  const needKey = error === 'NO_KEY';

  return (
    <div className="app-shell relative flex flex-col md:flex-row">
      <ConversationDrawer />
      <div className="relative flex-1 min-w-0 flex flex-col">
      <header className="absolute top-0 inset-x-0 z-20 flex items-center gap-2 px-3 py-2.5 border-b border-border bg-panel/60 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="p-2 -ml-1 rounded-lg text-text-dim active:bg-panel-2"
          aria-label="会话列表"
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 5.5h14M3 10h14M3 14.5h9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-sm font-medium truncate">{activeTitle}</div>
          <div className="text-[11px] text-text-dim">{model}</div>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="p-2 -mr-1 rounded-lg text-text-dim active:bg-panel-2"
          aria-label="设置"
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      {error && (
        <div className="absolute inset-x-0 z-10 flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-sm text-red-400 backdrop-blur-xl" style={{ top: 'var(--header-h)' }}>
          <span className="flex-1">
            {needKey ? '请先在设置页填写 DeepSeek API Key' : error}
          </span>
          {needKey && (
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-lg border border-red-400/40"
              onClick={() => {
                clearError();
                setShowSettings(true);
              }}
            >
              去设置
            </button>
          )}
          <button
            type="button"
            onClick={clearError}
            className="p-1 text-red-300/70"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      )}

      <MessageList />
      <Composer onNeedKey={() => setShowSettings(true)} />
      </div>

      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
    </div>
  );
}
