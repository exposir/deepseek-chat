import { useChat } from '../store/chat';
import { formatTime } from '../utils/format';

/** 按天数差分组：今天 / 昨天 / 本周 / 更早 */
function dayGroup(ts: number): string {
  const now = new Date();
  const d = new Date(ts);
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((day0 - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 7) return '本周';
  return '更早';
}

export function ConversationDrawer({ onOpenSettings }: { onOpenSettings: () => void }) {
  const open = useChat((s) => s.drawerOpen);
  const setOpen = useChat((s) => s.setDrawerOpen);
  const conversations = useChat((s) => s.conversations);
  const activeConvId = useChat((s) => s.activeConvId);
  const selectConversation = useChat((s) => s.selectConversation);
  const newConversation = useChat((s) => s.newConversation);
  const removeConversation = useChat((s) => s.removeConversation);

  return (
    <>
      {/* 遮罩（仅移动端） */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity md:hidden ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setOpen(false)}
      />
      {/* 抽屉面板：移动端 overlay 滑入；md+ 静态 sidebar 常驻布局 */}
      <aside
        className={`flex flex-col bg-panel border-r border-border w-72 md:w-80 max-w-[80vw]
          fixed inset-y-0 left-0 z-40 transition-transform duration-200
          md:static md:z-0 md:transition-none md:translate-x-0 ${
            open ? 'translate-x-0' : '-translate-x-full md:hidden'
          }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-border">
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
          {(['今天', '昨天', '本周', '更早'] as const).map((group) => {
            const list = conversations.filter((c) => dayGroup(c.updatedAt) === group);
            if (list.length === 0) return null;
            return (
              <div key={group}>
                <div className="px-5 pt-2 pb-1 text-[11px] text-text-dim/60">{group}</div>
                {list.map((c) => (
                  <div
                    key={c.id}
                    className={`group flex items-center gap-2 mx-2 px-3 py-2.5 rounded-xl cursor-pointer ${
                      c.id === activeConvId ? 'bg-panel-2' : 'active:bg-panel-2/60 hover:bg-panel-2/50'
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
            );
          })}
        </div>
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-text-dim hover:bg-panel-2/60 active:bg-panel-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            设置
          </button>
        </div>
      </aside>
    </>
  );
}
