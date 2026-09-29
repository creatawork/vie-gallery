import type { BrandSiteInquiryRequest, BrandSiteResponse } from '@vie/gallery-contracts'

/**
 * 品牌站公开 API。所有请求无鉴权；草稿只在创建者预览（admin 内嵌）场景经 postMessage 下发。
 */
async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(path, init)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`请求失败（${res.status}）`)
  return (await res.json()) as T
}

export function fetchPublicSite(subdomain: string): Promise<BrandSiteResponse | null> {
  return request<BrandSiteResponse>(`/api/public/sites/${encodeURIComponent(subdomain)}`)
}

export function submitInquiry(subdomain: string, body: BrandSiteInquiryRequest): Promise<boolean> {
  return fetch(`/api/public/sites/${encodeURIComponent(subdomain)}/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then((res) => {
    if (res.ok) return true
    if (res.status === 404) return false // 询盘存储端点未上线（WP-13）
    throw new Error(`提交失败（${res.status}）`)
  })
}
