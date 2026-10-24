'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { findLiterals, classify, trimUrl } = require('../lib/scan')
const { loadRegistry } = require('../lib/registry')

const FIX = path.join(__dirname, 'fixture')
const reg = () => loadRegistry(['docs/link-registry.adoc'], { cwd: FIX })
const billing = () => fs.readFileSync(path.join(FIX, 'docs/modules/ROOT/pages/billing.adoc'), 'utf8')

describe('scan', () => {
  it('trims trailing punctuation and unbalanced parens', () => {
    assert.strictEqual(trimUrl('https://a.org/x.'), 'https://a.org/x')
    assert.strictEqual(trimUrl('https://a.org/x)'), 'https://a.org/x')
    assert.strictEqual(trimUrl('https://a.org/wiki/A_(b)'), 'https://a.org/wiki/A_(b)')
  })
  it('skips comments, escapes, ignore markers and listing blocks', () => {
    const lines = findLiterals(billing()).map((l) => l.line)
    assert.deepStrictEqual(lines, [3, 5, 7, 9, 11])
  })
  it('includes listing blocks on request', () => {
    assert.ok(findLiterals(billing(), { includeBlocks: true }).some((l) => l.line === 22))
  })
  it('classifies exact, scheme/slash, fragment and near-miss', () => {
    const { errors, warnings } = classify(findLiterals(billing()), reg())
    assert.deepStrictEqual(errors.map((e) => [e.line, e.kind, e.replacement]), [
      [3, 'exact', '{url-stripe-billing}'],
      [5, 'exact', '{url-stripe-billing}'],
      [7, 'fragment', '{url-antora-docs}#install']
    ])
    assert.deepStrictEqual(warnings.map((w) => [w.line, w.entry.name]), [[9, 'url-stripe-billing']])
  })
  it('flags near-miss hosts with the same path', () => {
    const { warnings } = classify([{ url: 'https://stirpe.com/docs/billing', line: 1, column: 1 }], reg())
    assert.strictEqual(warnings[0].entry.name, 'url-stripe-billing')
  })
})
