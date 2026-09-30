export interface AttachmentFile { id?: string | number; fileName: string; cosUrl: string; image: boolean }
/** 只使用附件表提供的公开链接；兼容历史附件未填写 MIME 类型。 */
export function attachmentFiles(value: unknown): AttachmentFile[] {
  let raw: unknown = value;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const files: AttachmentFile[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || typeof item.cosUrl !== 'string') continue;
    let url: URL;
    try { url = new URL(item.cosUrl); } catch { continue; }
    if (!['https:', 'http:'].includes(url.protocol) || seen.has(url.href)) continue;
    seen.add(url.href);
    const fileName = typeof item.fileName === 'string' ? item.fileName : '附件';
    const mime = typeof item.mimeType === 'string' ? item.mimeType.toLowerCase().split(';')[0] : '';
    let pathname = url.pathname;
    try { pathname = decodeURIComponent(pathname); } catch { /* Keep the original path for invalid encodings. */ }
    const image = mime.startsWith('image/') || (!mime && (/\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)$/i.test(fileName) || /\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)$/i.test(pathname)));
    files.push({ id: item.id, fileName, cosUrl: url.href, image });
  }
  return files.sort((a, b) => String(a.id ?? a.cosUrl).localeCompare(String(b.id ?? b.cosUrl), undefined, { numeric: true }));
}
