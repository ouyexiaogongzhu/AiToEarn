#!/usr/bin/env node
/**
 * Substitute %%ENV_KEY%% placeholders in a config file using process.env.
 * Usage: node substitute-config.mjs <input> <output>
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [, , inputPath, outputPath] = process.argv
if (!inputPath || !outputPath) {
  console.error('Usage: node substitute-config.mjs <input> <output>')
  process.exit(1)
}

let content = readFileSync(inputPath, 'utf8')
const missing = new Set()

content = content.replace(/%%([A-Z0-9_]+)%%/g, (_match, key) => {
  const value = process.env[key]
  if (value === undefined || value === '') {
    missing.add(key)
    return _match
  }
  return value
})

if (missing.size > 0) {
  console.error(`Missing required secrets: ${[...missing].join(', ')}`)
  console.error('Run: node scripts/bootstrap-secrets.mjs')
  process.exit(1)
}

writeFileSync(outputPath, content)
