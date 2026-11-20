// 插件自己的本地数据库（IndexedDB，一个键值表）。Vault 相关的所有持久状态都在这里，移除插件就没了。
import { limit, Stuck } from '../timeout.ts';

const DB = 'chatgpt-clipper', STORE = 'kv';

// 表里都存了什么（键 → 值）：
/** 设置页选的 Vault 文件夹句柄 */
export const KEY = 'vaultDir';
/** Obsidian 位置（用户手填的「Vault 名/路径」） */
export const WHERE = 'obsidianPath';
/** 已收藏清单：saved:<指纹> → { folder, note }（早期只存文件夹名字符串） */
export const SAVED = 'saved:';
/** 写入日志：一条正在覆盖的收藏的改前副本（journal.ts） */
export const PENDING = 'pending-write';
/** 整段收藏的暂存任务 thread-job:<任务号>、预留文件夹 thread-folder:<对话地址>（staging.ts） */
export const THREAD_JOB = 'thread-job:', THREAD_FOLDER = 'thread-folder:';
/** 设置页上一次自检的结果（diag.ts） */
export const PAGE_DIAG = 'diag:page';

// 到时不只是不等了，还要中止事务、关掉连接：卡住的读事务不结束，同一个库后面所有的写都排在它后面一起卡
// （2026-11-20：读文件夹句柄卡住后，设置页重新选文件夹也存不进，L-26）
export function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest, ms = limit(mode === 'readonly' ? 'idbRead' : 'idbWrite')): Promise<T> {
  return new Promise((resolve, reject) => {
    let db: IDBDatabase | undefined, tx: IDBTransaction | undefined, late = false;
    const timer = setTimeout(() => {
      late = true;
      try { tx?.abort(); } catch { /* 事务已结束 */ }
      db?.close();
      reject(new Stuck(`浏览器的本地数据库 ${ms / 1000} 秒没回应`));
    }, ms);
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => { clearTimeout(timer); reject(open.error); };
    open.onsuccess = () => {
      db = open.result;
      if (late) return db.close();
      const t = tx = db.transaction(STORE, mode);
      let req: IDBRequest;
      t.oncomplete = () => { clearTimeout(timer); db!.close(); resolve(req.result as T); };
      t.onabort = t.onerror = () => { clearTimeout(timer); db!.close(); reject(t.error ?? new Error('收藏索引没有提交')); };
      try { req = run(t.objectStore(STORE)); }
      catch (e) { clearTimeout(timer); t.abort(); db.close(); reject(e); }
    };
  });
}
