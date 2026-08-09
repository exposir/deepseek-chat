import { useChat } from '../store/chat';
import { formatTime } from '../utils/format';

export function ConversationDrawer() {
  const open = useChat((s) => s.drawerOpen);
  const setOpen = useChat((s) => s.setDrawerOpen);
  const conversations = useChat((s) => s.conversations);
  const activeConvId = useChat((s) => s.activeConvId);
  const selectConversation = useChat((s) => s.selectConversation);
  const newConversation = useChat((s) => s.newConversation);
  const removeConversation = useChat((s) => s.removeConversation);

  return (
    <>
      {/* 遮罩 */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setOpen(false)}
      />
      {/* 抽屉面板 */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[80vw] bg-panel border-r border-border flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <span className="font-semibold">会话</span>
          <button
            type="button"
            onClick={() => void newConversation()}
            className="text-sm text-accent px-2 py-1 rounded-lg active:bg-accent/10"
          >
            + 新对话
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-2 mx-2 px-3 py-2.5 rounded-xl cursor-pointer ${
                c.id === activeConvId ? 'bg-panel-2' : 'active:bg-panel-2/60'
              }`}
              onClick={() => void selectConversation(c.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{c.title}</div>
                <div className="text-[12px] text-text-dim mt-0.5">{formatTime(c.updatedAt)}</div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('删除该会话？')) void removeConversation(c.id);
                }}
                className="shrink-0 p-1.5 rounded-lg text-text-dim/60 active:text-red-400"
                aria-label="删除会话"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.8 7v3.5M9.2 7v3.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
