/** 字节数转可读文本。bytes 为空时返回 fallback（默认「未知大小」）。 */
export function formatBytes(bytes?: number, fallback = '未知大小'): string {
  if (!bytes || bytes <= 0) return fallback
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
