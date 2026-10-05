import * as THREE from 'three'
export interface TextureBudget { maxEdge: number; bytes: number; concurrent: number; resident: number }
export interface LoadedTexture { texture: THREE.Texture; bytes: number }
export type TextureLoad = (url: string, maxEdge: number, signal: AbortSignal) => Promise<LoadedTexture>
interface Owner {
  urls: string[]; priority: number; order: number; entry: string; texture: THREE.Texture | null; failed: boolean
  promise: Promise<THREE.Texture>; resolve: (texture: THREE.Texture) => void; reject: (error: Error) => void; settled: boolean
}
interface Entry {
  id: string; urls: string[]; edge: number; controller: AbortController; state: 'queued' | 'loading' | 'ready'
  texture?: THREE.Texture; bytes: number; used: number
}
const aborted = () => new DOMException('Texture request cancelled', 'AbortError')

/** Shared GPU textures, bounded admission and one cancellable queue. No decoded-image cache. */
export class TexturePool {
  private owners = new Map<object, Owner>()
  private entries = new Map<string, Entry>()
  private listeners = new Map<object, (texture: THREE.Texture | null) => void>()
  private knownBytes = new Map<string, number>()
  private active = 0
  private serial = 0
  private disposed = false
  private scheduled = false
  constructor(private budget: TextureBudget, private load: TextureLoad) {}
  onChange(key: object, listener: (texture: THREE.Texture | null) => void): void { this.listeners.set(key, listener) }
  acquire(key: object, urls: string[], priority: number): Promise<THREE.Texture> {
    if (this.disposed) return Promise.reject(aborted())
    const existing = this.owners.get(key)
    if (existing) { this.touch(key, priority); return existing.texture ? Promise.resolve(existing.texture) : existing.promise }
    const unique = [...new Set(urls.filter(Boolean))]
    if (!unique.length) return Promise.reject(new Error('No texture URL'))
    let resolve!: Owner['resolve'], reject!: Owner['reject']
    const promise = new Promise<THREE.Texture>((yes, no) => { resolve = yes; reject = no })
    this.owners.set(key, { urls: unique, priority, order: ++this.serial, entry: this.id(unique), texture: null, failed: false, promise, resolve, reject, settled: false })
    this.schedule()
    return promise
  }
  touch(key: object, priority: number): void {
    const owner = this.owners.get(key)
    if (!owner) return
    if (owner.priority !== priority) { owner.priority = priority; this.schedule() }
    const entry = this.entries.get(owner.entry)
    if (entry?.texture && Number.isFinite(priority)) entry.used = ++this.serial
  }
  release(key: object): void {
    const owner = this.owners.get(key)
    if (owner && !owner.settled) owner.reject(aborted())
    this.listeners.get(key)?.(null)
    this.listeners.delete(key); this.owners.delete(key)
    if (owner && ![...this.owners.values()].some(value => value.entry === owner.entry)) {
      const entry = this.entries.get(owner.entry)
      if (entry && entry.state !== 'ready') this.evict(entry)
      this.knownBytes.delete(owner.entry)
    }
    this.schedule()
  }
  setBudget(budget: TextureBudget): void {
    const changedEdge = budget.maxEdge !== this.budget.maxEdge
    this.budget = { ...budget }
    if (changedEdge) {
      for (const entry of [...this.entries.values()]) this.evict(entry)
      this.knownBytes.clear()
      for (const owner of this.owners.values()) owner.entry = this.id(owner.urls)
    }
    this.trim(0, 0)
    this.schedule()
  }
  getMetrics(): { resident: number; bytes: number; pending: number; active: number } {
    const ready = [...this.entries.values()].filter(entry => entry.state === 'ready')
    return { resident: ready.length, bytes: ready.reduce((n, entry) => n + entry.bytes, 0),
      pending: [...this.entries.values()].filter(entry => entry.state === 'queued').length, active: this.active }
  }
  getBudget(): TextureBudget { return { ...this.budget } }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const key of [...this.owners.keys()]) this.release(key)
    for (const entry of [...this.entries.values()]) this.evict(entry)
    this.listeners.clear(); this.knownBytes.clear()
  }
  private id(urls: string[]): string { return JSON.stringify([urls[0], this.budget.maxEdge]) }
  private schedule(): void {
    if (this.scheduled || this.disposed) return
    this.scheduled = true
    queueMicrotask(() => { this.scheduled = false; if (!this.disposed) this.rebalance() })
  }
  private priorities(): Map<string, number> {
    const priorities = new Map<string, number>()
    for (const owner of this.owners.values()) priorities.set(owner.entry, Math.min(priorities.get(owner.entry) ?? Infinity, owner.priority))
    return priorities
  }
  private rebalance(): void {
    const priorities = this.priorities()
    const desired = new Map<string, Owner>()
    let bytes = 0
    const candidates = [...this.owners.values()].filter(owner => Number.isFinite(owner.priority) && !owner.failed)
      .sort((a, b) => a.priority - b.priority || a.order - b.order)
    for (const owner of candidates) {
      if (desired.has(owner.entry)) continue
      const estimate = this.knownBytes.get(owner.entry) ?? Math.ceil(this.budget.maxEdge ** 2 * 4 * 4 / 3)
      if (desired.size >= this.budget.resident || bytes + estimate > this.budget.bytes) continue
      desired.set(owner.entry, owner); bytes += estimate
    }
    // In-flight work leaving the selected set is cancelled before another job starts.
    for (const entry of [...this.entries.values()]) if (!desired.has(entry.id) && entry.state !== 'ready') this.evict(entry)
    for (const [id, owner] of desired) {
      let entry = this.entries.get(id)
      if (!entry) {
        entry = { id, urls: owner.urls, edge: this.budget.maxEdge, controller: new AbortController(), state: 'queued', bytes: 0, used: ++this.serial }
        this.entries.set(id, entry)
      }
      if (entry.texture) this.deliver(entry)
    }
    // Keep nonvisible cache entries only while there is room; visible distance outranks LRU.
    const queued = [...this.entries.values()].filter(entry => entry.state === 'queued' && desired.has(entry.id))
      .sort((a, b) => (priorities.get(a.id) ?? Infinity) - (priorities.get(b.id) ?? Infinity) || a.used - b.used)
    for (const entry of queued) {
      if (this.active >= this.budget.concurrent) break
      this.active++; entry.state = 'loading'
      void this.loadEntry(entry)
    }
  }
  private async loadEntry(entry: Entry): Promise<void> {
    let result: LoadedTexture | undefined, failure: unknown
    try {
      for (const url of entry.urls) {
        if (entry.controller.signal.aborted) break
        try { result = await this.load(url, entry.edge, entry.controller.signal); break }
        catch (error) { failure = error }
      }
      if (this.disposed || entry.controller.signal.aborted || this.entries.get(entry.id) !== entry) { result?.texture.dispose(); return }
      if (!result) {
        this.entries.delete(entry.id)
        for (const owner of this.owners.values()) if (owner.entry === entry.id) {
          owner.failed = true
          if (!owner.settled) { owner.settled = true; owner.reject(failure instanceof Error ? failure : new Error('Texture download failed')) }
        }
        return
      }
      this.knownBytes.set(entry.id, result.bytes)
      this.trim(result.bytes, 1)
      const metrics = this.getMetrics()
      if (metrics.bytes + result.bytes > this.budget.bytes || metrics.resident + 1 > this.budget.resident) {
        result.texture.dispose(); this.entries.delete(entry.id); return
      }
      entry.texture = result.texture; entry.bytes = result.bytes; entry.state = 'ready'; entry.used = ++this.serial
      this.deliver(entry)
    } finally { this.active--; this.schedule() }
  }
  private deliver(entry: Entry): void {
    for (const [key, owner] of this.owners) if (owner.entry === entry.id && owner.texture !== entry.texture) {
      owner.texture = entry.texture!
      this.listeners.get(key)?.(entry.texture!)
      if (!owner.settled) { owner.settled = true; owner.resolve(entry.texture!) }
    }
  }
  private trim(extraBytes: number, extraResident: number): void {
    const priorities = this.priorities()
    const victims = [...this.entries.values()].filter(entry => entry.state === 'ready')
      .sort((a, b) => (priorities.get(b.id) ?? Infinity) - (priorities.get(a.id) ?? Infinity) || a.used - b.used)
    let metrics = this.getMetrics()
    for (const entry of victims) {
      if (metrics.bytes + extraBytes <= this.budget.bytes && metrics.resident + extraResident <= this.budget.resident) break
      this.evict(entry); metrics = this.getMetrics()
    }
  }
  private evict(entry: Entry): void {
    entry.controller.abort(); this.entries.delete(entry.id)
    for (const [key, owner] of this.owners) if (owner.entry === entry.id && owner.texture) {
      owner.texture = null; this.listeners.get(key)?.(null)
    }
    entry.texture?.dispose()
  }
}

/** Decoded originals exist only during a bounded load; the retained canvas matches GPU size. */
export async function loadPhotoTexture(url: string, maxEdge: number, signal: AbortSignal): Promise<LoadedTexture> {
  const response = await fetch(url, { signal, mode: 'cors' })
  if (!response.ok) throw new Error(`Texture download failed (${response.status})`)
  const blob = await response.blob()
  let image: ImageBitmap | HTMLImageElement
  try { image = await createImageBitmap(blob) }
  catch {
    const objectUrl = URL.createObjectURL(blob)
    try {
      image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image()
        const abort = () => { element.src = ''; reject(aborted()) }
        signal.addEventListener('abort', abort, { once: true })
        element.onload = () => { signal.removeEventListener('abort', abort); resolve(element) }
        element.onerror = () => { signal.removeEventListener('abort', abort); reject(new Error('Texture decode failed')) }
        element.crossOrigin = 'anonymous'; element.src = objectUrl
        if (signal.aborted) abort()
      })
    } finally { URL.revokeObjectURL(objectUrl) }
  }
  try {
    if (signal.aborted) throw aborted()
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Texture resize unavailable')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.addEventListener('dispose', () => { canvas.width = 1; canvas.height = 1 })
    return { texture, bytes: Math.ceil(canvas.width * canvas.height * 4 * 4 / 3) }
  } finally { if ('close' in image) image.close() }
}
