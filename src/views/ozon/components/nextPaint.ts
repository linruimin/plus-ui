/**
 * 等浏览器把「当前这一帧」真正画到屏幕上。
 *
 * 跟 `nextTick()` 的区别：`nextTick` 只保证 DOM 已经更新，**不保证已经 paint**。
 * 我们要的恰恰是「先让这次便宜的更新上屏，再去做昂贵的重渲染」——
 * 典型场景：切视图时先只改按钮选中态（几乎零成本），等它画出来之后再应用
 * 视图配置去触发整表重渲染（实测 200~500ms）。否则两者挤在同一帧里，
 * 按钮颜色要等重渲染做完才出现，用户点下去感觉「半天没反应」。
 *
 * 用两次 rAF：第一次 rAF 的回调仍在当前帧内执行，第二次 rAF 时才能确保上一帧已经上屏。
 */
export function nextPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
