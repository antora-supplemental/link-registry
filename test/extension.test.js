'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { register, hrefs } = require('../lib/extension')

const FIX = path.join(__dirname, 'fixture')

function harness (config) {
  const handlers = {}
  const logs = []
  const ctx = {
    getLogger: () => ({ info: (m) => logs.push(['info', m]), warn: (m) => logs.push(['warn', m]), error: (m) => logs.push(['error', m]) }),
    on: (ev, fn) => { handlers[ev] = fn }
  }
  register.call(ctx, { config, playbook: { dir: FIX, asciidoc: { attributes: { 'url-playbook-only': 'https://pb.example.org/' } } } })
  return { handlers, logs }
}

function page (rel, adoc, html) {
  return {
    src: { component: 'fixture', version: '', module: 'ROOT', relative: rel, stem: rel.replace(/\.adoc$/, ''), mediaType: 'text/asciidoc' },
    contents: Buffer.from(html || adoc),
    out: { path: rel },
    pub: { url: '/fixture/' + rel.replace(/\.adoc$/, '/') },
    asciidoc: { doctitle: rel }
  }
}

describe('extension', () => {
  it('extracts hrefs', () => {
    assert.deepStrictEqual(hrefs('<a href="https://a.org/x?a=1&amp;b=2">x</a><a class="y" href="/local">'), ['https://a.org/x?a=1&b=2'])
  })
  it('injects registry attributes, warns on literals, writes the JSON index', () => {
    const { handlers, logs } = harness({ registry: './docs/link-registry.adoc' })
    const cv = { version: '', asciidoc: { attributes: { 'url-stripe-billing': 'https://override.example/' } } }
    const billing = page('billing.adoc', fs.readFileSync(path.join(FIX, 'docs/modules/ROOT/pages/billing.adoc'), 'utf8'))
    const catalog = {
      getComponents: () => [{ name: 'fixture', versions: [cv] }],
      findBy: () => [billing]
    }
    handlers.contentClassified({ contentCatalog: catalog })
    assert.strictEqual(cv.asciidoc.attributes['url-antora-docs'], 'https://docs.antora.org/antora/latest/')
    assert.strictEqual(cv.asciidoc.attributes['url-stripe-billing'], 'https://override.example/', 'component attrs win')
    assert.ok(logs.some(([l, m]) => l === 'warn' && /billing\.adoc:3 writes https:\/\/stripe\.com\/docs\/billing literally/.test(m)))

    const a = page('a.adoc', '', '<a href="https://docs.antora.org/antora/latest/#install">i</a><a href="https://pb.example.org">p</a>')
    const b = page('b.adoc', '', '<a href="https://docs.antora.org/antora/latest/">i</a><a href="https://docs.antora.org/antora/latest/">again</a>')
    handlers.documentsConverted({ contentCatalog: { getPages: () => [a, b] } })
    const files = []
    handlers.beforePublish({ siteCatalog: { addFile: (f) => files.push(f) } })
    assert.strictEqual(files[0].out.path, '_/link-registry/index.json')
    const idx = JSON.parse(files[0].contents.toString())
    const antora = idx.links.find((l) => l.name === 'url-antora-docs')
    assert.strictEqual(antora.pages.length, 2)
    assert.strictEqual(antora.uses, 3)
    assert.ok(idx.links.some((l) => l.name === 'url-playbook-only'))
    assert.ok(idx.unusedNames.includes('url-asciidoc-attrs'))
  })
  it('index: false skips the JSON file', () => {
    const { handlers } = harness({ index: false })
    const files = []
    handlers.beforePublish({ siteCatalog: { addFile: (f) => files.push(f) } })
    assert.strictEqual(files.length, 0)
  })
})
