import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { TexturePool, type LoadedTexture } from '../src/core/TexturePool'
const budget = { maxEdge: 1, bytes: 100, concurrent: 2, resident: 4 }
const flush = () => new Promise<void>(resolve => setImmediate(resolve))
test('pool shares URLs, limits concurrency, and releases stale completions exactly once', async () => {
  const jobs: Array<{ url: string; signal: AbortSignal; finish: (loaded: LoadedTexture) => void }> = []
  const pool = new TexturePool(budget, (url, _edge, signal) => new Promise(resolve => jobs.push({ url, signal, finish: resolve })))
  const a = {}, b = {}, c = {}, d = {}
  const first = pool.acquire(a, ['same', 'same'], 0), shared = pool.acquire(b, ['same'], 0)
  const third = pool.acquire(c, ['third'], 1), fourth = pool.acquire(d, ['fourth'], 2)
  await flush(); assert.equal(jobs.length, 2); assert.equal(pool.getMetrics().active, 2)
  for (let i = 0; i < 10; i++) pool.touch(a, 0)
  await flush(); assert.equal(jobs.length, 2)
  const texture = new THREE.Texture(); jobs[0].finish({ texture, bytes: 4 })
  assert.equal(await first, texture); assert.equal(await shared, texture)
  await flush(); assert.equal(jobs.length, 3)
  pool.release(a); assert.equal(pool.getMetrics().resident, 1)
  pool.release(c); await assert.rejects(third, { name: 'AbortError' })
  let disposed = 0
  const stale = new THREE.Texture(); stale.addEventListener('dispose', () => disposed++)
  jobs[1].finish({ texture: stale, bytes: 4 }); await flush()
  assert.equal(disposed, 1)
  pool.dispose(); await assert.rejects(fourth, { name: 'AbortError' })
  jobs[2].finish({ texture: stale.clone(), bytes: 4 }); await flush()
  assert.equal(pool.getMetrics().resident, 0)
})
test('fallback deduplicates URLs, budget reduction clears material observers and maxEdge changes reload safely', async () => {
  const calls: string[] = []
  const pool = new TexturePool(budget, async (url, edge) => {
    calls.push(`${url}:${edge}`)
    if (url === 'bad') throw Error('injected download failure')
    return { texture: new THREE.Texture(), bytes: 16 }
  })
  const a = {}, b = {}
  let current: THREE.Texture | null = null
  pool.onChange(a, texture => { current = texture })
  await pool.acquire(a, ['bad', 'bad', 'good'], 0)
  await pool.acquire(b, ['other'], 1)
  assert.deepEqual(calls, ['bad:1', 'good:1', 'other:1'])
  assert.ok(current)
  pool.setBudget({ ...budget, bytes: 0, resident: 0 })
  assert.equal(current, null)
  assert.equal(pool.getMetrics().resident, 0)
  pool.setBudget({ ...budget, maxEdge: 2 })
  await flush(); await flush()
  assert.ok(calls.includes('good:2'))
  assert.ok(pool.getMetrics().bytes <= 100)
  pool.dispose()
})
test('removal aborts queued work and all failures remain retryable', async () => {
  const pool = new TexturePool({ ...budget, concurrent: 1 }, async () => { throw Error('all failed') })
  const key = {}
  await assert.rejects(pool.acquire(key, ['bad'], 0), /all failed/)
  pool.release(key)
  await assert.rejects(pool.acquire(key, [], 0), /No texture URL/)
  pool.dispose()
})
