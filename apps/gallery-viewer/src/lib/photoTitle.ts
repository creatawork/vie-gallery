/** Upload names are metadata, not exhibition copy. Keep every other authored title. */
export function exhibitionTitle(title?: string | null): string | null {
  const text = title?.trim()
  if (!text || /\.(?:jpe?g|png|webp|gif|avif|heic|heif|tiff?|bmp|svg)$/i.test(text)) return null
  return text
}

export function photoLabel(title: string | null | undefined, index: number): string {
  return exhibitionTitle(title) ?? `作品 ${index + 1}`
}
