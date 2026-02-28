#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const localesDir = path.join(rootDir, 'public', 'locales')

const localeRules = {
  en: {
    buttonMax: 36,
    statusMax: 44,
    titleMax: 88,
    placeholderMax: 140,
  },
  'zh-CN': {
    buttonMax: 18,
    statusMax: 24,
    titleMax: 42,
    placeholderMax: 84,
  },
}

const buttonLikeLeafKeys = new Set([
  'submit',
  'download',
  'back',
  'next',
  'previous',
  'cancel',
  'confirm',
  'apply',
  'export',
  'import',
  'login',
  'logout',
  'register',
  'retry',
  'copy',
  'copyStats',
  'startCompress',
  'startConvert',
  'startProcess',
  'selectFile',
  'takePhoto',
  'browseFiles',
  'clearAll',
  'clear',
  'reset',
  'undo',
  'redo',
])

function walkStrings(value, currentPath, out) {
  if (typeof value === 'string') {
    out.push([currentPath, value])
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => walkStrings(item, `${currentPath}[${idx}]`, out))
    return
  }
  if (!value || typeof value !== 'object') return
  Object.entries(value).forEach(([key, next]) => {
    walkStrings(next, currentPath ? `${currentPath}.${key}` : key, out)
  })
}

function inferLimit(keyPath, rules) {
  const leaf = keyPath.split('.').at(-1) ?? keyPath

  if (buttonLikeLeafKeys.has(leaf)) return { max: rules.buttonMax, kind: 'button-like' }
  if (leaf.endsWith('Title') || leaf === 'title') return { max: rules.titleMax, kind: 'title' }
  if (leaf.includes('status') || keyPath.includes('.status.')) return { max: rules.statusMax, kind: 'status' }
  if (leaf.includes('placeholder') || leaf === 'hint') return { max: rules.placeholderMax, kind: 'placeholder/hint' }

  return null
}

function main() {
  const violations = []
  const locales = Object.keys(localeRules)

  for (const locale of locales) {
    const localeDir = path.join(localesDir, locale)
    if (!fs.existsSync(localeDir)) {
      violations.push(`Missing locale directory: ${localeDir}`)
      continue
    }

    const files = fs.readdirSync(localeDir).filter((name) => name.endsWith('.json'))
    for (const fileName of files) {
      const filePath = path.join(localeDir, fileName)
      const content = fs.readFileSync(filePath, 'utf8')
      const json = JSON.parse(content)
      const strings = []
      walkStrings(json, '', strings)

      for (const [keyPath, rawValue] of strings) {
        const value = rawValue.trim()
        if (!value) continue
        const config = inferLimit(keyPath, localeRules[locale])
        if (!config) continue

        const length = Array.from(value).length
        if (length <= config.max) continue

        violations.push(
          `[${locale}] ${fileName} :: ${keyPath} (${config.kind}) length ${length} > ${config.max} :: "${value}"`,
        )
      }
    }
  }

  if (violations.length > 0) {
    console.error(`i18n length check failed with ${violations.length} violation(s):`)
    violations.forEach((line) => console.error(`- ${line}`))
    process.exit(1)
  }

  console.log('i18n length check passed.')
}

main()
