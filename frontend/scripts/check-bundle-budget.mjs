#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const assetsDir = path.join(rootDir, 'dist', 'assets')

const DEFAULT_MAX_BYTES = 650 * 1024
const TOTAL_JS_MAX_BYTES = 6 * 1024 * 1024

const overrides = [
  { pattern: /^tokenizer-.*\.js$/, maxBytes: 3_400_000 },
  { pattern: /^pdf\.worker.*\.mjs$/, maxBytes: 1_300_000 },
]

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`
}

function getBudget(fileName) {
  for (const rule of overrides) {
    if (rule.pattern.test(fileName)) return rule.maxBytes
  }
  return DEFAULT_MAX_BYTES
}

function main() {
  if (!fs.existsSync(assetsDir)) {
    console.error(`Bundle budget check failed: ${assetsDir} does not exist. Run build first.`)
    process.exit(1)
  }

  const files = fs.readdirSync(assetsDir).filter((file) => file.endsWith('.js') || file.endsWith('.mjs'))
  const stats = files.map((file) => {
    const fullPath = path.join(assetsDir, file)
    const size = fs.statSync(fullPath).size
    const budget = getBudget(file)
    return { file, size, budget, over: size > budget }
  })

  const totalJsBytes = stats.reduce((sum, item) => sum + item.size, 0)
  const oversized = stats.filter((item) => item.over).sort((a, b) => b.size - a.size)

  if (oversized.length > 0 || totalJsBytes > TOTAL_JS_MAX_BYTES) {
    console.error('Bundle budget check failed.')
    if (oversized.length > 0) {
      console.error('Oversized chunks:')
      for (const item of oversized) {
        console.error(`- ${item.file}: ${formatKB(item.size)} (budget ${formatKB(item.budget)})`)
      }
    }
    if (totalJsBytes > TOTAL_JS_MAX_BYTES) {
      console.error(`Total JS size too large: ${formatKB(totalJsBytes)} (budget ${formatKB(TOTAL_JS_MAX_BYTES)})`)
    }
    process.exit(1)
  }

  const heaviest = [...stats].sort((a, b) => b.size - a.size).slice(0, 8)
  console.log('Bundle budget check passed.')
  console.log(`Total JS: ${formatKB(totalJsBytes)}`)
  console.log('Top chunks:')
  heaviest.forEach((item) => {
    console.log(`- ${item.file}: ${formatKB(item.size)} (budget ${formatKB(item.budget)})`)
  })
}

main()
