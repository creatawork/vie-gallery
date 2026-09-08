#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const MARKDOWN_LINK = /!?\[[^\]]*\]\(([^)]+)\)/g

function getMarkdownFiles(dir) {
  let results = []
  if (!fs.existsSync(dir)) return results
  const list = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...getMarkdownFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath)
    }
  }
  return results
}

const scannedFiles = [
  path.join(ROOT, 'README.md'),
  path.join(ROOT, 'CONTRIBUTING.md'),
  ...getMarkdownFiles(path.join(ROOT, 'docs'))
].filter(p => fs.existsSync(p))

function isExternal(target) {
  return target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:') || target.startsWith('#')
}

function main() {
  const missing = []
  let checked = 0

  for (const file of scannedFiles) {
    const content = fs.readFileSync(file, 'utf-8')
    const lines = content.split(/\r?\n/)

    lines.forEach((line, index) => {
      const lineNum = index + 1
      let match
      while ((match = MARKDOWN_LINK.exec(line)) !== null) {
        const rawTarget = match[1].trim().replace(/^<|>$/g, '')
        if (!rawTarget) continue

        const target = rawTarget.split('#')[0].trim()
        if (!target || isExternal(rawTarget)) continue

        checked++
        const resolved = path.resolve(path.dirname(file), target)
        if (!fs.existsSync(resolved)) {
          missing.push({
            file: path.relative(ROOT, file).replace(/\\/g, '/'),
            line: lineNum,
            target: rawTarget
          })
        }
      }
    })
  }

  if (missing.length > 0) {
    console.error(`Found ${missing.length} missing relative Markdown link(s):`)
    for (const item of missing) {
      console.error(`  ${item.file}:${item.line}: ${item.target}`)
    }
    process.exit(1)
  }

  console.log(`Checked ${checked} relative Markdown link(s); all targets exist.`)
  process.exit(0)
}

main()
