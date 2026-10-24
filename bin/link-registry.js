#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { resolveConfig } = require('../lib/config')
const { runCheck, suggest } = require('../lib/check')
const { applyFixes, appendChangeLog } = require('../lib/fix')
const { errorMessage, warningMessage, annotation } = require('../lib/report')
const { installHook } = require('../lib/hook')
const pkg = require('../package.json')

const HELP = `link-registry ${pkg.version} - keep registered links as named AsciiDoc attributes

Usage: link-registry <command> [paths...] [options]

Commands:
  check          Fail (exit 1) when a .adoc file writes a registered URL literally
  fix            Rewrite those literals to {url-name} and log them to the change log
  suggest        List unregistered URLs used --min times or more (default 2)
  list           Print the loaded registry
  hook install   Install a git pre-commit hook that runs \`check --staged\`

Options:
  --registry <file>   Registry file (.adoc attributes or Antora .yml); repeatable
  --root <dir>        Folder to scan (default: docs/ or .); repeatable
  --prefix <p>        Only attributes starting with <p> are links (default url-; "" = all)
  --changes <file>    Change log for fix (default docs/link-registry-changes.adoc)
  --staged            Only scan staged .adoc files
  --include-blocks    Also scan listing / literal blocks
  --strict            Near-miss warnings fail the check too
  --min <n>           suggest: minimum uses (default 2)
  --write <file>      suggest: append proposed attributes to an .adoc registry file
  --fix-cmd <cmd>     Command named in messages (default "pnpm links:fix")
  --json              Machine-readable output
  --verbose           List scanned files and registry
  -h, --help / -v, --version`

function parseArgs (argv) {
  const o = { _: [], registry: [], root: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => argv[++i]
    if (a === '--registry') o.registry.push(val())
    else if (a === '--root') o.root.push(val())
    else if (a === '--prefix') o.prefix = val()
    else if (a === '--changes') o.changes = val()
    else if (a === '--min') o.min = Number(val())
    else if (a === '--write') o.write = val()
    else if (a === '--fix-cmd') o.fixCmd = val()
    else if (a === '--cwd') o.cwd = val()
    else if (a === '--staged') o.staged = true
    else if (a === '--include-blocks') o.includeBlocks = true
    else if (a === '--strict') o.strict = true
    else if (a === '--json') o.json = true
    else if (a === '--verbose') o.verbose = true
    else if (a === '-h' || a === '--help') o.help = true
    else if (a === '-v' || a === '--version') o.version = true
    else o._.push(a)
  }
  return o
}

function main (argv, io = { out: (s) => process.stdout.write(s + '\n'), err: (s) => process.stderr.write(s + '\n'), env: process.env }) {
  const o = parseArgs(argv)
  if (o.version) { io.out(pkg.version); return 0 }
  const [cmd, ...rest] = o._
  if (o.help || !cmd) { io.out(HELP); return cmd || o.help ? 0 : 2 }
  const cwd = path.resolve(o.cwd || process.cwd())
  const gha = io.env.GITHUB_ACTIONS === 'true'
  const fixCmd = o.fixCmd || 'pnpm links:fix'
  let cfg
  try {
    cfg = resolveConfig(cwd, {
      registry: o.registry.length ? o.registry : undefined,
      roots: o.root.length ? o.root : undefined,
      prefix: o.prefix,
      changes: o.changes,
      includeBlocks: o.includeBlocks,
      strict: o.strict
    })
  } catch (e) { io.err(`link-registry: ${e.message}`); return 2 }

  if (cmd === 'hook') {
    if (rest[0] !== 'install') { io.err('link-registry: usage: link-registry hook install'); return 2 }
    const r = installHook(cwd)
    io.out(r.message)
    return 0
  }

  if (!cfg.registry.length) {
    io.err('link-registry: no registry found. Create docs/link-registry.adoc (lines like `:url-stripe-billing: https://...`) or pass --registry.')
    return 2
  }

  let res
  try {
    res = runCheck(cfg, { cwd, paths: rest, staged: o.staged })
  } catch (e) { io.err(`link-registry: ${e.message}`); return 2 }
  for (const d of res.registry.duplicates) io.err(`link-registry: warning: {${d.entry.name}} (${d.entry.source}) repeats the URL of {${d.existing.name}}; keep one name per link.`)
  if (o.verbose) {
    io.out(`registry: ${cfg.registry.join(', ')} (${res.registry.entries.length} links)`)
    for (const f of res.files) io.out(`scanned: ${path.relative(cwd, f).split(path.sep).join('/')}`)
  }

  if (cmd === 'list') {
    if (o.json) io.out(JSON.stringify(res.registry.entries.map(({ name, url, source }) => ({ name, url, source })), null, 2))
    else for (const e of res.registry.entries) io.out(`{${e.name}}  ${e.url}`)
    return 0
  }

  if (cmd === 'suggest') {
    const s = suggest(cfg, { cwd, min: o.min || 2 })
    if (o.write && s.length) {
      const file = path.resolve(cwd, o.write)
      let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
      if (text && !text.endsWith('\n')) text += '\n'
      text += s.map((x) => `:${x.name}: ${x.url}`).join('\n') + '\n'
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, text)
    }
    if (o.json) io.out(JSON.stringify(s, null, 2))
    else if (!s.length) io.out(`link-registry: no unregistered URL is used ${o.min || 2}+ times.`)
    else {
      for (const x of s) io.out(`:${x.name}: ${x.url}    // ${x.count} uses in ${x.files.length} file(s)`)
      io.out(o.write ? `link-registry: appended ${s.length} attribute(s) to ${o.write}. Rename them to something memorable, then run \`${fixCmd}\`.` : `link-registry: ${s.length} candidate(s). Add them to your registry (or rerun with --write <file>), then run \`${fixCmd}\`.`)
    }
    return 0
  }

  if (cmd === 'fix') {
    const applied = applyFixes(res.errors)
    appendChangeLog(path.resolve(cwd, cfg.changes), applied)
    if (o.json) io.out(JSON.stringify({ applied, warnings: res.warnings.map(strip) }, null, 2))
    else {
      for (const a of applied) io.out(`fixed ${a.file}:${a.line}  ${a.literal} -> ${a.replacement}`)
      for (const w of res.warnings) io.err(`warning: ${warningMessage(w)}`)
      io.out(applied.length ? `link-registry: rewrote ${applied.length} literal(s); logged in ${cfg.changes}.` : 'link-registry: nothing to fix.')
    }
    return 0
  }

  if (cmd !== 'check') { io.err(`link-registry: unknown command "${cmd}"\n\n${HELP}`); return 2 }

  const fail = res.errors.length > 0 || (cfg.strict && res.warnings.length > 0)
  if (o.json) {
    io.out(JSON.stringify({ ok: !fail, scanned: res.files.length, registered: res.registry.entries.length, errors: res.errors.map(strip), warnings: res.warnings.map(strip) }, null, 2))
  } else {
    for (const e of res.errors) {
      const msg = errorMessage(e, fixCmd)
      io.out(gha ? annotation('error', e, 'Registered link written literally', msg) : `error: ${msg}`)
    }
    for (const w of res.warnings) {
      const msg = warningMessage(w)
      io.out(gha ? annotation(cfg.strict ? 'error' : 'warning', w, 'Possible typo of a registered link', msg) : `warning: ${msg}`)
    }
    const nFiles = new Set(res.errors.map((e) => e.file)).size
    if (res.errors.length) io.out(`link-registry: ${res.errors.length} literal URL(s) in ${nFiles} file(s) are registered links. Use the {url-...} names, or run \`${fixCmd}\`. (${res.files.length} files scanned, ${res.registry.entries.length} registered links)`)
    else io.out(`link-registry: ok - ${res.files.length} files scanned, ${res.registry.entries.length} registered links${res.warnings.length ? `, ${res.warnings.length} warning(s)` : ''}.`)
  }
  return fail ? 1 : 0
}

function strip ({ abs, entry, ...rest }) {
  return { ...rest, name: entry.name, registeredUrl: entry.url }
}

module.exports = { main, parseArgs }

if (require.main === module) process.exitCode = main(process.argv.slice(2))
