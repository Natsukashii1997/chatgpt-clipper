// 给后台发消息（内容脚本、设置页用）。
import type { Kind, Ok, Reply, Req } from './messages.ts';
import { limit, Stuck, within } from './timeout.ts';

/** 发给后台，限时等回话：后台一直不回（L-13、L-25）到时按失败算、late 为 true，调用方退回下载，不卡在「入库」。
 *  ms 为 0 不限时。后台没有回任何东西时 res 是 undefined。插件刷新后页面还是旧脚本时这里直接抛错 */
export async function ask<K extends Kind>(msg: Req<K>, ms = limit('save')): Promise<{ res: Reply<K> | undefined; late: boolean }> {
  try {
    const res = await within('后台', ms, browser.runtime.sendMessage(msg).catch((e: Error) => ({ ok: false, error: e.message }))) as Reply<K> | undefined;
    return { res, late: false };
  } catch (e) {
    if (!(e instanceof Stuck)) throw e;
    return { res: { ok: false, error: `后台 ${ms / 1000} 秒没回话` }, late: true };
  }
}

/** 发给后台、等回话，不成就抛错 */
export async function send<K extends Kind>(msg: Req<K>, ms = limit('save')): Promise<Ok<K>> {
  const { res } = await ask(msg, ms);
  if (!res) throw new Error('后台无响应');
  if (!res.ok) throw new Error(res.error);
  return res;
}
