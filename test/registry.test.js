'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert')
const { parseAdocAttributes, parseYamlAttributes, buildRegistry } = require('../lib/registry')

describe('registry', () => {
  it('parses AsciiDoc attribute entries', () => {
    const e = parseAdocAttributes('// c\n:url-a: https://a.org/x\n:not-a-url: hello\n')
    assert.deepStrictEqual(e.map((x) => [x.name, x.value, x.line]), [['url-a', 'https://a.org/x', 2], ['not-a-url', 'hello', 3]])
  })
  it('parses asciidoc.attributes from a playbook', () => {
    const yml = `site:\n  title: x\nasciidoc:\n  attributes:\n    url-a: https://a.org/x\n    url-b: "https://b.org/"\n    url-c: 'https://c.org/y@'\n    stem: latexmath\n  extensions:\n    - foo\nurls:\n  url-z: https://z.org\n`
    const e = parseYamlAttributes(yml)
    assert.deepStrictEqual(e.map((x) => [x.name, x.value]), [['url-a', 'https://a.org/x'], ['url-b', 'https://b.org/'], ['url-c', 'https://c.org/y'], ['stem', 'latexmath']])
  })
  it('keeps url-* names only by default and reports duplicate URLs', () => {
    const r = buildRegistry([
      { name: 'url-a', value: 'https://a.org/x' },
      { name: 'kroki-server-url', value: 'https://kroki.io' },
      { name: 'url-a2', value: 'http://a.org/x/' }
    ])
    assert.deepStrictEqual(r.entries.map((e) => e.name), ['url-a'])
    assert.strictEqual(r.duplicates.length, 1)
    assert.strictEqual(buildRegistry([{ name: 'kroki-server-url', value: 'https://kroki.io' }], { prefix: '' }).entries.length, 1)
  })
})
