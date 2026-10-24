'use strict'

// URL comparison keys. Two literals point at "the same link" when they differ only in
// scheme (http vs https), host case, or a trailing slash on the path.

function parse (raw) {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

function stripSlash (p) {
  return p.length > 1 ? p.replace(/\/+$/, '') : (p === '/' ? '' : p)
}

/** Comparison key: host + path (no trailing slash) + query [+ fragment]. */
function urlKey (raw, { fragment = true } = {}) {
  const u = parse(raw)
  if (!u || !/^https?:$/.test(u.protocol)) return null
  const host = u.host.toLowerCase()
  return host + stripSlash(u.pathname) + u.search + (fragment ? u.hash : '')
}

function hostOf (raw) {
  const u = parse(raw)
  return u ? u.host.toLowerCase().replace(/^www\./, '') : null
}

function pathOf (raw) {
  const u = parse(raw)
  return u ? stripSlash(u.pathname) + u.search : null
}

function fragmentOf (raw) {
  const u = parse(raw)
  return u ? u.hash : ''
}

function levenshtein (a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

module.exports = { parse, urlKey, hostOf, pathOf, fragmentOf, levenshtein }
