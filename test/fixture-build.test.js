'use strict'
// End-to-end: real Antora build of test/fixture (skipped when antora is not installed or offline).
const { describe, it } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
let antoraBin
try { antoraBin = require.resolve('antora/bin/antora', { paths: [ROOT] }) } catch {}
const skip = !antoraBin || process.env.LINK_REGISTRY_SKIP_BUILD ? 'antora not installed' : false

describe('fixture build', { skip }, () => {
  it('resolves {url-*} from the registry file and writes the index', () => {
    const out = path.join(ROOT, 'build', 'fixture-test')
    fs.rmSync(out, { recursive: true, force: true })
    const r = spawnSync(process.execPath, [antoraBin, 'test/fixture/antora-playbook.yml', '--to-dir', out, '--log-format', 'pretty'], { cwd: ROOT, encoding: 'utf8' })
    if (r.status !== 0 && /ENOTFOUND|EAI_AGAIN|getaddrinfo/.test(r.stderr + r.stdout)) return
    assert.strictEqual(r.status, 0, r.stderr + r.stdout)
    const html = fs.readFileSync(path.join(out, 'fixture', 'index.html'), 'utf8')
    assert.match(html, /href="https:\/\/stripe\.com\/docs\/billing"/)
    assert.doesNotMatch(html, /\{url-stripe-billing\}/)
    const idx = JSON.parse(fs.readFileSync(path.join(out, '_', 'link-registry', 'index.json'), 'utf8'))
    const stripe = idx.links.find((l) => l.name === 'url-stripe-billing')
    assert.ok(stripe.pages.length >= 2)
    assert.match(r.stdout + r.stderr, /writes https:\/\/stripe\.com\/docs\/billing literally/)
  })
})
