/**
 * 品牌站（gallery-site）实时预览地址。
 * 开发端口下站点应用固定运行在 5175（base /site/）；生产同源部署在 /site/ 路径。
 */
export function siteOrigin(): string {
  const { protocol, hostname, port } = window.location
  if (['5173', '5174', '5175', '5176'].includes(port)) {
    return `${protocol}//${hostname}:5175`
  }
  return window.location.origin
}

export function sitePreviewUrl(): string {
  const url = new URL(`${siteOrigin()}/site/`)
  url.searchParams.set('embed', 'preview')
  return url.toString()
}
