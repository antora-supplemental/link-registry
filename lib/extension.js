'use strict'

/**
 * Antora extension (optional build-time half of link-registry).
 *
 * - `registry:` .adoc attribute files (or .yml) are injected as AsciiDoc attributes into every
 *   component version, so `{url-name}[label]` resolves without per-page includes.
 * - Warns (does not fail) when a page writes a registered URL literally. CI's `link-registry
 *   check` is the gate; this is a second line of sight in build logs.
 * - Writes an outbound-link index (which pages link to which URL) to `_/link-registry/index.json`.
 *
 *   antora:
 *     extensions:
 *       - require: '@antora-supplemental/link-registry'
 *         registry: ./docs/link-registry.adoc
 */

const path = require('path')
const { readRegistryFile, buildRegistry } = require('./registry')
const { findLiterals, classify } = require('./scan')
const { urlKey } = require('./normalize')

const PKG = '@antora-supplemental/link-registry'

function decodeHtml (s) {
  return s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function hrefs (html) {
  const out = []
  const rx = /<a\b[^>]*?\bhref="(https?:\/\/[^"]+)"/gi
  let m
  while ((m = rx.exec(html))) out.push(decodeHtml(m[1]))
  return out
}

function normalizeOptions (config = {}) {
  const reg = config.registry
  return {
    registry: reg == null ? [] : Array.isArray(reg) ? reg : [reg],
    prefix: config.prefix != null ? String(config.prefix) : 'url-',
    warnLiterals: config.warnLiterals !== false,
    index: config.index !== false,
    indexPath: config.indexPath || '_/link-registry/index.json'
  }
}

function register ({ config = {}, playbook }) { // no default: Antora checks register.length === 1
  const logger = this.getLogger(PKG)
  const opts = normalizeOptions(config)
  const baseDir = (playbook && playbook.dir) || process.cwd()
  const fileEntries = []
  for (const f of opts.registry) {
    const abs = path.resolve(baseDir, f)
    try {
      for (const e of readRegistryFile(abs)) fileEntries.push({ ...e, source: f })
    } catch (err) {
      logger.error(`registry file ${f} could not be read: ${err.message}`)
    }
  }
  const playbookAttrs = Object.entries((playbook && playbook.asciidoc && playbook.asciidoc.attributes) || {})
    .map(([name, value]) => ({ name, value: typeof value === 'string' ? value.replace(/@$/, '') : value, source: 'playbook' }))
  let registry = buildRegistry([...fileEntries, ...playbookAttrs], { prefix: opts.prefix })

  this.on('contentClassified', ({ contentCatalog }) => {
    // Attributes set in a component's antora.yml apply to that component version only, so each
    // component version gets its own registry (shared file + playbook entries, plus its own).
    const shared = [...fileEntries, ...playbookAttrs]
    const all = [...shared]
    const byCv = new Map()
    for (const component of contentCatalog.getComponents()) {
      for (const cv of component.versions) {
        if (fileEntries.length) {
          cv.asciidoc = cv.asciidoc || {}
          const attrs = (cv.asciidoc.attributes = cv.asciidoc.attributes || {})
          for (const e of fileEntries) if (!(e.name in attrs)) attrs[e.name] = e.value
        }
        const attrs = (cv.asciidoc && cv.asciidoc.attributes) || {}
        const own = []
        for (const [name, value] of Object.entries(attrs)) if (typeof value === 'string') own.push({ name, value: value.replace(/@$/, ''), source: `${component.name}@${cv.version}` })
        all.push(...own)
        byCv.set(`${cv.version}@${component.name}`, buildRegistry([...shared, ...own], { prefix: opts.prefix }))
      }
    }
    registry = buildRegistry(all, { prefix: opts.prefix })
    if (!opts.warnLiterals || !registry.entries.length) return
    let n = 0
    for (const page of contentCatalog.findBy({ family: 'page' })) {
      if (!page.contents || page.src.mediaType !== 'text/asciidoc') continue
      const reg = byCv.get(`${page.src.version}@${page.src.component}`)
      if (!reg || !reg.entries.length) continue
      const { errors } = classify(findLiterals(page.contents.toString()), reg)
      for (const e of errors) {
        n++
        logger.warn(`${page.src.component}::${page.src.relative}:${e.line} writes ${e.url} literally; it is registered as {${e.entry.name}}. Use ${e.replacement}[...] (link-registry fix).`)
      }
    }
    if (n) logger.info(`${n} literal use(s) of registered links; \`link-registry check\` in CI rejects these.`)
  })

  const usage = new Map()
  this.on('documentsConverted', ({ contentCatalog }) => {
    if (!opts.index) return
    for (const page of contentCatalog.getPages((p) => p.out && p.contents)) {
      const seen = new Set()
      for (const url of hrefs(page.contents.toString())) {
        const key = urlKey(url, { fragment: false })
        if (!key) continue
        if (!usage.has(key)) usage.set(key, { url: url.replace(/#.*$/, ''), pages: [], count: 0 })
        const u = usage.get(key)
        u.count++
        if (seen.has(key)) continue
        seen.add(key)
        u.pages.push({ url: page.pub.url, title: (page.asciidoc && page.asciidoc.doctitle) || page.src.stem, component: page.src.component, version: page.src.version, module: page.src.module, path: page.src.relative })
      }
    }
  })

  this.on('beforePublish', ({ siteCatalog }) => {
    if (!opts.index) return
    const byKeyNoFrag = new Map(registry.entries.map((e) => [e.keyNoFrag, e]))
    const links = [...usage.entries()].map(([key, u]) => {
      const e = byKeyNoFrag.get(key)
      return { url: e ? e.url : u.url, name: e ? e.name : null, uses: u.count, pages: u.pages.sort((a, b) => a.url.localeCompare(b.url)) }
    }).sort((a, b) => b.pages.length - a.pages.length || a.url.localeCompare(b.url))
    const unused = registry.entries.filter((e) => !usage.has(e.keyNoFrag)).map((e) => e.name)
    const data = { generator: PKG, version: require('../package.json').version, registry: Object.fromEntries(registry.entries.map((e) => [e.name, e.url])), unusedNames: unused, links }
    siteCatalog.addFile({ contents: Buffer.from(JSON.stringify(data, null, 2) + '\n'), out: { path: opts.indexPath } })
    logger.info(`outbound-link index: ${links.length} URL(s), ${registry.entries.length} registered -> /${opts.indexPath}`)
  })
}

module.exports = { register, hrefs, normalizeOptions }
