#!/usr/bin/env node
// Usage:
//   npm run release            → tag current version from manifest
//   npm run release 1.1.0     → bump both manifests to 1.1.0, commit, tag, push

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const SOURCE_MANIFEST = 'extension/manifest.json'
const DERIVED_MANIFESTS = [
  'extension/manifests/manifest.firefox.json',
  'extension/manifests/manifest.chrome.json',
]

function readManifest(p) {
  return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'))
}

function writeManifest(p, data) {
  fs.writeFileSync(path.resolve(p), JSON.stringify(data, null, 2) + '\n')
}

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' })
}

const newVersion = process.argv[2]
const current = readManifest(SOURCE_MANIFEST).version

if (newVersion) {
  if (!/^\d+\.\d+(\.\d+)?$/.test(newVersion)) {
    console.error(`Invalid version: ${newVersion}`)
    process.exit(1)
  }
  const toNum = v => v.split('.').map(Number)
  const [cMaj, cMin, cPat = 0] = toNum(current)
  const [nMaj, nMin, nPat = 0] = toNum(newVersion)
  const isHigher = nMaj > cMaj || (nMaj === cMaj && nMin > cMin) || (nMaj === cMaj && nMin === cMin && nPat > cPat)
  if (!isHigher) {
    console.error(`New version ${newVersion} must be higher than current ${current}`)
    process.exit(1)
  }
  const all = [SOURCE_MANIFEST, ...DERIVED_MANIFESTS]
  for (const p of all) {
    const m = readManifest(p)
    m.version = newVersion
    writeManifest(p, m)
  }
  console.log(`Bumped ${current} → ${newVersion}`)
  run(`git add ${all.join(' ')}`)
  run(`git commit -m "chore: release v${newVersion}"`)
}

const version = newVersion ?? current
const tag = `v${version}`

try {
  execSync(`git rev-parse ${tag}`, { stdio: 'ignore' })
  console.error(`Tag ${tag} already exists locally. Run: git tag -d ${tag}`)
  process.exit(1)
} catch {}

run(`git tag ${tag}`)
run(`git push origin HEAD ${tag}`)
console.log(`Released ${tag}`)
