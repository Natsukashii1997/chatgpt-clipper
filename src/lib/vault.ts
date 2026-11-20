// 写进 Obsidian Vault 的全部逻辑，按职责分在 vault/ 下，这里只是统一出口：
//   store.ts    插件自己的数据库（键值表）和里面存了什么
//   fs.ts       读写 Vault 文件夹的小工具
//   dir.ts      Vault 文件夹的句柄与授权、Obsidian 位置
//   journal.ts  已收藏清单、写入队列、写入日志与恢复、整组提交
//   save.ts     单条收藏、节选
//   staging.ts  整段收藏：预留文件夹、暂存任务
//   diag.ts     自检
export * from './vault/fs.ts';
export * from './vault/dir.ts';
export { getSaved, type Saved } from './vault/journal.ts';
export * from './vault/save.ts';
export { beginThread, cancelThread, endThread, stageThreadFile, THREAD_IMAGE } from './vault/staging.ts';
export * from './vault/diag.ts';
