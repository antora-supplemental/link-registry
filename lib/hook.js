'use strict'

// Optional local pre-commit hook. CI is the gate; `git commit --no-verify` skips the hook.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const MARK = '# link-registry pre-commit hook'
const SCRIPT = `#!/bin/sh
${MARK} (installed by \`link-registry hook install\`; skip once with git commit --no-verify)
if [ -x node_modules/.bin/link-registry ]; then
  node_modules/.bin/link-registry check --staged || exit 1
fi
`

function git (cwd, args) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' }
}

function installHook (cwd) {
  const top = git(cwd, ['rev-parse', '--show-toplevel'])
  if (!top) return { installed: false, message: 'link-registry: not a git repository; hook not installed.' }
  if (process.env.CI) return { installed: false, message: 'link-registry: CI detected; hook not installed (CI runs the check itself).' }
  const hooksPath = git(cwd, ['config', 'core.hooksPath'])
  const dir = hooksPath ? path.resolve(top, hooksPath) : path.resolve(top, git(cwd, ['rev-parse', '--git-path', 'hooks']) || '.git/hooks')
  if (hooksPath && !dir.startsWith(path.resolve(top) + path.sep)) {
    return { installed: false, message: `link-registry: core.hooksPath points outside this repo (${hooksPath}); not touching it. Add \`link-registry check --staged\` to that pre-commit hook or to lefthook.yml (see the docs).` }
  }
  const file = path.join(dir, 'pre-commit')
  if (fs.existsSync(file)) {
    const cur = fs.readFileSync(file, 'utf8')
    if (cur.includes(MARK)) return { installed: true, message: 'link-registry: pre-commit hook already installed.' }
    return { installed: false, message: `link-registry: ${file} already exists; add \`node_modules/.bin/link-registry check --staged\` to it yourself.` }
  }
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, SCRIPT, { mode: 0o755 })
  return { installed: true, message: `link-registry: installed pre-commit hook at ${file}.` }
}

module.exports = { installHook, SCRIPT }
