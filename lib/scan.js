'use strict'

// Find literal http(s) URLs in AsciiDoc source and classify them against the registry.

const { urlKey, hostOf, pathOf, fragmentOf, levenshtein } = require('./normalize')

const URL_RX = /(\\?)\b(https?:\/\/[^\s[\]<>"'`{}|^]+)/g
const DELIM_RX = /^(-{4,}|\.{4,}|\+{4,}|\/{4,})\s*$/
const IGNORE_RX = /^\/\/\s*link-registry:\s*ignore(-next-line)?\b/i

function trimUrl (u) {
  u = u.replace(/[.,;:!?*_]+$/, '')
  while (u.endsWith(')') && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length) u = u.slice(0, -1)
  return u.replace(/[.,;:!?*_]+$/, '')
}

/**
 * Literal URLs in prose. Skips comments, attribute entries, listing / literal / passthrough
 * blocks (examples are allowed to show raw URLs), escaped `\https://` and lines after
 * `// link-registry: ignore`.
 */
function findLiterals (text, { includeBlocks = false } = {}) {
  const out = []
  let block = null
  let ignoreNext = false
  text.split(/\r?\n/).forEach((line, i) => {
    const d = DELIM_RX.exec(line)
    if (d) {
      if (block === null) block = d[1]
      else if (block === d[1]) block = null
      return
    }
    if (block !== null && (block.startsWith('/') || !includeBlocks)) return
    if (IGNORE_RX.test(line)) { ignoreNext = true; return }
    if (ignoreNext) { ignoreNext = false; return }
    if (line.startsWith('//')) return
    if (/^:[^:\s][^:]*:/.test(line)) return
    URL_RX.lastIndex = 0
    let m
    while ((m = URL_RX.exec(line))) {
      if (m[1]) continue
      const url = trimUrl(m[2])
      out.push({ url, line: i + 1, column: m.index + 1 })
    }
  })
  return out
}

function nearThreshold (len) {
  return Math.max(2, Math.floor(len * 0.15))
}

/** Best near-miss for a literal that matched nothing exactly. */
function findNear (url, registry) {
  const host = hostOf(url)
  const p = pathOf(url)
  if (!host || p == null) return null
  let best = null
  for (const e of registry.entries) {
    const ep = pathOf(e.url)
    let dist = null
    if (e.host === host) {
      const d = levenshtein(p, ep)
      if (d > 0 && d <= nearThreshold(Math.max(p.length, ep.length))) dist = d
    } else if (p === ep && host.length > 5) {
      const d = levenshtein(host, e.host)
      if (d > 0 && d <= 2) dist = d
    }
    if (dist != null && (!best || dist < best.distance)) best = { entry: e, distance: dist }
  }
  return best
}

/**
 * Classify literals. Errors: same link as a registered name (scheme / trailing slash /
 * fragment-on-a-fragmentless-entry). Warnings: near misses (probable typos).
 */
function classify (literals, registry) {
  const errors = []
  const warnings = []
  for (const lit of literals) {
    const key = urlKey(lit.url)
    if (!key) continue
    const exact = registry.byKey.get(key)
    if (exact) { errors.push({ ...lit, entry: exact, replacement: `{${exact.name}}`, kind: 'exact' }); continue }
    const frag = fragmentOf(lit.url)
    if (frag) {
      const base = registry.entries.find((e) => !fragmentOf(e.url) && e.key === urlKey(lit.url, { fragment: false }))
      if (base) { errors.push({ ...lit, entry: base, replacement: `{${base.name}}${frag}`, kind: 'fragment' }); continue }
    }
    const near = findNear(lit.url, registry)
    if (near) warnings.push({ ...lit, entry: near.entry, distance: near.distance, kind: 'near' })
  }
  return { errors, warnings }
}

module.exports = { findLiterals, classify, findNear, trimUrl }
