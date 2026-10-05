import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

test('unit runner discovers nested tests and propagates failures', () => {
  const root = process.cwd()
  const dir = mkdtempSync(path.join(root, '.cache', 'runner-'))
  const nested = path.join(dir, 'packages/gallery-contracts/test/nested')
  mkdirSync(nested, { recursive: true })
  const file = path.join(nested, 'probe.test.ts')
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const run = () => spawnSync(process.execPath, [path.join(root, 'scripts/test-viewer-unit.mjs')], { cwd: dir, encoding: 'utf8', env })
  try {
    writeFileSync(file, "import test from 'node:test'; test('nested marker', () => {});")
    const success = run()
    assert.equal(success.status, 0, success.stderr)
    assert.match(success.stdout, /nested marker/)
    writeFileSync(file, "import test from 'node:test'; test('nested marker', () => { throw new Error('probe failure') });")
    const failure = run()
    assert.notEqual(failure.status, 0)
    assert.match(failure.stdout, /probe failure/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
