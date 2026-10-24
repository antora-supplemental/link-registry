'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { main } = require('../bin/link-registry')

const FIX = path.join(__dirname, 'fixture')

function copyFixture () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-registry-'))
  fs.cpSync(path.join(FIX, 'docs'), path.join(dir, 'docs'), { recursive: true })
  return dir
}

function run (args, env = {}) {
  const out = []
  const err = []
  const code = main(args, { out: (s) => out.push(s), err: (s) => err.push(s), env })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

describe('cli', () => {
  it('check fails with teaching messages', () => {
    const dir = copyFixture()
    const r = run(['check', '--cwd', dir])
    assert.strictEqual(r.code, 1)
    assert.match(r.out, /error: docs\/modules\/ROOT\/pages\/billing\.adoc:3 uses the literal https:\/\/stripe\.com\/docs\/billing which is registered as \{url-stripe-billing\}\. Write \{url-stripe-billing\}\[\.\.\.\] instead, or run `pnpm links:fix`\./)
    assert.match(r.out, /warning: .*billing\.adoc:9 .*typo of \{url-stripe-billing\}/)
    assert.match(r.out, /3 literal URL\(s\) in 1 file\(s\)/)
  })
  it('emits GitHub Actions annotations in Actions', () => {
    const r = run(['check', '--cwd', copyFixture()], { GITHUB_ACTIONS: 'true' })
    assert.match(r.out, /^::error file=docs\/modules\/ROOT\/pages\/billing\.adoc,line=3,col=5,title=Registered link written literally::/m)
    assert.match(r.out, /^::warning file=.*line=9/m)
  })
  it('--strict fails on warnings alone; --json is parseable', () => {
    const dir = copyFixture()
    run(['fix', '--cwd', dir])
    assert.strictEqual(run(['check', '--cwd', dir]).code, 0)
    assert.strictEqual(run(['check', '--cwd', dir, '--strict']).code, 1)
    const j = JSON.parse(run(['check', '--cwd', dir, '--json']).out)
    assert.strictEqual(j.ok, true)
    assert.strictEqual(j.warnings.length, 1)
  })
  it('fix rewrites sources and appends the change log', () => {
    const dir = copyFixture()
    const r = run(['fix', '--cwd', dir])
    assert.strictEqual(r.code, 0)
    const page = fs.readFileSync(path.join(dir, 'docs/modules/ROOT/pages/billing.adoc'), 'utf8')
    assert.match(page, /^See \{url-stripe-billing\}\[Stripe Billing\] for plans\.$/m)
    assert.match(page, /^Same page over http with a slash: \{url-stripe-billing\}\.$/m)
    assert.match(page, /^Deep link: \{url-antora-docs\}#install\[install Antora\]\.$/m)
    assert.match(page, /^Intentional literal: https:\/\/stripe\.com\/docs\/billing$/m)
    const log = fs.readFileSync(path.join(dir, 'docs/link-registry-changes.adoc'), 'utf8')
    assert.match(log, /^= Link registry changes/)
    assert.match(log, /^== \d{4}-\d{2}-\d{2}$/m)
    assert.match(log, /^\* `\+docs\/modules\/ROOT\/pages\/billing\.adoc:3\+` - `\+https:\/\/stripe\.com\/docs\/billing\+` -> `\+\{url-stripe-billing\}\+`$/m)
    assert.strictEqual((log.match(/^\* /gm) || []).length, 3)
    run(['fix', '--cwd', dir])
    assert.strictEqual((fs.readFileSync(path.join(dir, 'docs/link-registry-changes.adoc'), 'utf8').match(/^== /gm) || []).length, 1)
  })
  it('suggest proposes names for repeated unregistered URLs', () => {
    const dir = copyFixture()
    fs.writeFileSync(path.join(dir, 'docs/modules/ROOT/pages/more.adoc'), '= More\n\nhttps://example.org/elsewhere[x] and https://example.org/elsewhere/#a[y]\n')
    const r = run(['suggest', '--cwd', dir, '--json'])
    const s = JSON.parse(r.out)
    assert.deepStrictEqual(s.map((x) => [x.name, x.url, x.count]), [['url-example-elsewhere', 'https://example.org/elsewhere', 3]])
    run(['suggest', '--cwd', dir, '--write', 'docs/link-registry.adoc'])
    assert.match(fs.readFileSync(path.join(dir, 'docs/link-registry.adoc'), 'utf8'), /^:url-example-elsewhere: https:\/\/example\.org\/elsewhere$/m)
  })
  it('exits 2 with a hint when no registry exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-registry-empty-'))
    const r = run(['check', '--cwd', dir])
    assert.strictEqual(r.code, 2)
    assert.match(r.err, /no registry found/)
  })
})
