'use strict'

// Load the link registry: named URL attributes from an AsciiDoc attributes file
// (`:url-name: https://...`) or from the `asciidoc.attributes` map of an Antora
// playbook / antora.yml. Zero dependencies so the CI action runs without `pnpm install`.

const fs = require('fs')
const path = require('path')
const { urlKey, hostOf } = require('./normalize')

const URL_RX = /^https?:\/\/\S+$/i

function unquote (v) {
  v = v.trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  return v.replace(/@$/, '').trim() // Antora soft-set suffix
}

function parseAdocAttributes (text) {
  const out = []
  text.split(/\r?\n/).forEach((line, i) => {
    const m = /^:([A-Za-z0-9_][\w-]*):[ \t]+(\S.*?)\s*$/.exec(line)
    if (m) out.push({ name: m[1], value: m[2], line: i + 1 })
  })
  return out
}

/** Minimal YAML reader for the `asciidoc: attributes:` map (scalar values only). */
function parseYamlAttributes (text) {
  const out = []
  const lines = text.split(/\r?\n/)
  let asciidocIndent = -1
  let attrsIndent = -1
  let childIndent = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(#.*)?$/.test(line)) continue
    const indent = line.match(/^ */)[0].length
    if (attrsIndent >= 0) {
      if (indent <= attrsIndent) { attrsIndent = -1; childIndent = -1 } else {
        if (childIndent < 0) childIndent = indent
        if (indent !== childIndent) continue
        const m = /^\s*["']?([\w-]+)["']?:\s*(.*?)\s*$/.exec(line)
        if (m && m[2] && !/^[|>]/.test(m[2])) out.push({ name: m[1], value: unquote(m[2].replace(/\s+#.*$/, '')), line: i + 1 })
        continue
      }
    }
    if (asciidocIndent >= 0 && indent <= asciidocIndent) asciidocIndent = -1
    if (/^\s*asciidoc:\s*$/.test(line)) { asciidocIndent = indent; continue }
    if (asciidocIndent >= 0 && /^\s*attributes:\s*$/.test(line)) attrsIndent = indent
  }
  return out
}

function readRegistryFile (file) {
  const text = fs.readFileSync(file, 'utf8')
  return /\.ya?ml$/i.test(file) ? parseYamlAttributes(text) : parseAdocAttributes(text)
}

/**
 * Build a registry from attribute entries.
 * @returns {{ entries: Array<{name,url,key,keyNoFrag,host,source}>, byKey: Map, byName: Map }}
 */
function buildRegistry (entries, { prefix = 'url-' } = {}) {
  const reg = { entries: [], byKey: new Map(), byName: new Map(), duplicates: [] }
  for (const e of entries) {
    const url = e.value != null ? e.value : e.url
    if (!e.name || !url || !URL_RX.test(url)) continue
    if (prefix && !e.name.startsWith(prefix)) continue
    if (reg.byName.has(e.name)) continue // first definition wins (matches AsciiDoc precedence)
    const key = urlKey(url)
    if (!key) continue
    const entry = { name: e.name, url, key, keyNoFrag: urlKey(url, { fragment: false }), host: hostOf(url), source: e.source, line: e.line }
    if (reg.byKey.has(key)) { reg.duplicates.push({ entry, existing: reg.byKey.get(key) }); continue }
    reg.entries.push(entry)
    reg.byKey.set(key, entry)
    reg.byName.set(e.name, entry)
  }
  return reg
}

function loadRegistry (files, { cwd = process.cwd(), prefix = 'url-' } = {}) {
  const all = []
  for (const f of files) {
    const abs = path.resolve(cwd, f)
    if (!fs.existsSync(abs)) throw new Error(`registry file not found: ${f}`)
    for (const e of readRegistryFile(abs)) all.push({ ...e, source: path.relative(cwd, abs).split(path.sep).join('/') })
  }
  return buildRegistry(all, { prefix })
}

module.exports = { parseAdocAttributes, parseYamlAttributes, readRegistryFile, buildRegistry, loadRegistry }
