'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert')
const { urlKey, levenshtein, hostOf } = require('../lib/normalize')

describe('normalize', () => {
  it('ignores scheme, host case and trailing slash', () => {
    assert.strictEqual(urlKey('http://Stripe.com/docs/billing/'), urlKey('https://stripe.com/docs/billing'))
  })
  it('keeps query and fragment unless asked', () => {
    assert.notStrictEqual(urlKey('https://a.org/x?y=1'), urlKey('https://a.org/x'))
    assert.strictEqual(urlKey('https://a.org/x#s', { fragment: false }), urlKey('https://a.org/x'))
  })
  it('rejects non-http', () => assert.strictEqual(urlKey('mailto:a@b.c'), null))
  it('levenshtein', () => {
    assert.strictEqual(levenshtein('billing', 'biling'), 1)
    assert.strictEqual(levenshtein('abc', 'abc'), 0)
  })
  it('hostOf strips www', () => assert.strictEqual(hostOf('https://www.x.org/a'), 'x.org'))
})
