import Dexie, { type EntityTable } from 'dexie';
import type { ResponseItem, Usage } from '../api/types';

export interface ConversationRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** 手动重命名过：自动标题生成不再覆盖 */
  titleCustom?: boolean;
}

/** 会话内单条 item：以 API 原始 item JSON 为准，UI 状态由 item 派生 */
export interface ItemRecord {
  id?: number; // 自增主键
  convId: string;
  seq: number; // 会话内顺序号
  item: ResponseItem;
  /** 附加元数据（仅 assistant 轮末尾 message 携带 usage；失败标记等） */
  meta?: {
    usage?: Usage;
    error?: string;
    interrupted?: boolean;
  };
}

const db = new Dexie('deepseek-chat') as Dexie & {
  conversations: EntityTable<ConversationRecord, 'id'>;
  items: EntityTable<ItemRecord, 'id'>;
};

db.version(1).stores({
  conversations: 'id, updatedAt',
  items: '++id, convId, [convId+seq]',
});

export async function listConversations(): Promise<ConversationRecord[]> {
  return db.conversations.orderBy('updatedAt').reverse().toArray();
}

export async function createConversation(record: ConversationRecord): Promise<void> {
  await db.conversations.add(record);
}

export async function touchConversation(id: string, title?: string): Promise<void> {
  const patch: Partial<ConversationRecord> = { updatedAt: Date.now() };
  if (title !== undefined) patch.title = title;
  await db.conversations.update(id, patch);
}

export async function updateConversation(
  id: string,
  patch: Partial<ConversationRecord>,
): Promise<void> {
  await db.conversations.update(id, patch);
}

export async function deleteConversation(id: string): Promise<void> {
  await db.transaction('rw', db.conversations, db.items, async () => {
    await db.items.where('convId').equals(id).delete();
    await db.conversations.delete(id);
  });
}

export async function listItems(convId: string): Promise<ItemRecord[]> {
  return db.items.where('[convId+seq]').between([convId, 0], [convId, Infinity]).toArray();
}

export async function appendItem(record: ItemRecord): Promise<void> {
  await db.items.add(record);
}

/** 批量落库（流式收尾一次写入，避免逐条 add 中途失败留下半截会话） */
export async function bulkAddItems(records: ItemRecord[]): Promise<void> {
  if (records.length === 0) return;
  await db.items.bulkAdd(records);
}

/** 截断会话：删除 seq >= fromSeq 的所有 item（编辑消息回退用） */
export async function truncateItems(convId: string, fromSeq: number): Promise<void> {
  await db.items.where('[convId+seq]').between([convId, fromSeq], [convId, Infinity]).delete();
}

export async function nextSeq(convId: string): Promise<number> {
  const last = await db.items.where('[convId+seq]').between([convId, 0], [convId, Infinity]).last();
  return (last?.seq ?? -1) + 1;
}

export { db };
