'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const SKIP_DIRS = new Set(['node_modules', '.git', 'build', '.cache', 'dist'])

function walk (dir, out) {
  let ents
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out) } else if (e.name.endsWith('.adoc')) out.push(path.join(dir, e.name))
  }
  return out
}

function listAdoc (roots, cwd) {
  const out = []
  for (const r of roots) {
    const abs = path.resolve(cwd, r)
    if (!fs.existsSync(abs)) continue
    if (fs.statSync(abs).isFile()) out.push(abs)
    else walk(abs, out)
  }
  return [...new Set(out)].sort()
}

function stagedAdoc (cwd) {
  const outp = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { cwd, encoding: 'utf8' })
  return outp.split(/\r?\n/).filter((f) => f.endsWith('.adoc')).map((f) => path.resolve(cwd, f))
}

const rel = (cwd, f) => path.relative(cwd, f).split(path.sep).join('/')

module.exports = { listAdoc, stagedAdoc, rel }
