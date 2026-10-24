'use strict'

const fs = require('fs')
const path = require('path')
const { loadRegistry } = require('./registry')
const { findLiterals, classify } = require('./scan')
const { listAdoc, stagedAdoc, rel } = require('./files')
const { urlKey } = require('./normalize')

/** Scan files and return { registry, files, errors, warnings }. Never writes. */
function runCheck (cfg, { cwd = process.cwd(), paths = [], staged = false } = {}) {
  const registry = loadRegistry(cfg.registry, { cwd, prefix: cfg.prefix })
  const exclude = new Set([...cfg.registry, cfg.changes].filter(Boolean).map((f) => path.resolve(cwd, f)))
  let files = staged ? stagedAdoc(cwd) : listAdoc(paths.length ? paths : cfg.roots, cwd)
  files = files.filter((f) => !exclude.has(f) && fs.existsSync(f))
  const errors = []
  const warnings = []
  const texts = new Map()
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8')
    texts.set(f, text)
    const r = classify(findLiterals(text, { includeBlocks: cfg.includeBlocks }), registry)
    const file = rel(cwd, f)
    for (const e of r.errors) errors.push({ ...e, file, abs: f })
    for (const w of r.warnings) warnings.push({ ...w, file, abs: f })
  }
  return { registry, files, texts, errors, warnings }
}

/** Unregistered literals used `min`+ times: candidates to register. */
function suggest (cfg, { cwd = process.cwd(), min = 2 } = {}) {
  const res = runCheck(cfg, { cwd })
  const counts = new Map()
  for (const [f, text] of res.texts) {
    for (const lit of findLiterals(text, { includeBlocks: cfg.includeBlocks })) {
      const k = urlKey(lit.url, { fragment: false })
      if (!k || res.registry.byKey.has(urlKey(lit.url))) continue
      if (res.registry.entries.some((e) => e.key === k)) continue
      const c = counts.get(k) || { url: lit.url.replace(/#.*$/, ''), uses: [], files: new Set() }
      c.uses.push({ file: rel(cwd, f), line: lit.line })
      c.files.add(rel(cwd, f))
      counts.set(k, c)
    }
  }
  const taken = new Set(res.registry.byName.keys())
  return [...counts.values()].filter((c) => c.uses.length >= min)
    .sort((a, b) => b.uses.length - a.uses.length || a.url.localeCompare(b.url))
    .map((c) => {
      const name = uniqueName(proposeName(c.url, cfg.prefix || 'url-'), taken)
      taken.add(name)
      return { name, url: c.url, count: c.uses.length, files: [...c.files], uses: c.uses }
    })
}

function proposeName (url, prefix) {
  const u = new URL(url)
  const host = u.hostname.replace(/^www\./, '').replace(/\.(com|org|net|io|dev|app|co|edu|gov)(\.[a-z]{2})?$/, '').replace(/\./g, '-')
  const segs = u.pathname.split('/').filter(Boolean).map((s) => s.replace(/\.[a-z0-9]+$/i, '')).slice(-2)
  const slug = [host, ...segs].join('-').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return prefix + slug.slice(0, 48).replace(/-$/, '')
}

function uniqueName (name, taken) {
  if (!taken.has(name)) return name
  let i = 2
  while (taken.has(`${name}-${i}`)) i++
  return `${name}-${i}`
}

module.exports = { runCheck, suggest, proposeName }
