// 几个模块都要用的页面小工具。

/** 转义后放进 HTML 文本或属性 */
export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Blob → data: 地址 */
export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(b);
  });
}

/** 元素所在的滚动容器：最近的能纵向滚动的祖先，没有就是整页 */
export function scrollParent(el: HTMLElement): HTMLElement {
  for (let a = el.parentElement; a; a = a.parentElement)
    if (/auto|scroll/.test(getComputedStyle(a).overflowY) && a.scrollHeight > a.clientHeight) return a;
  return document.scrollingElement as HTMLElement;
}
