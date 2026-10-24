'use strict'

// Rewrite literal URLs to their registered attribute and log each change.

const fs = require('fs')
const path = require('path')

const CHANGES_HEADER = `= Link registry changes
:page-orig-author: link-registry
:description: Automatic rewrites from literal URLs to registered link attributes.

Written by \`links:fix\` (\`link-registry fix\`). Each entry records when a literal URL was replaced by its registered attribute, where, and which name was used. Separate from the project changelog.
`

/** Apply errors (from runCheck) to their files. Returns applied changes. */
function applyFixes (errors, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const byFile = new Map()
  for (const e of errors) {
    if (!byFile.has(e.abs)) byFile.set(e.abs, [])
    byFile.get(e.abs).push(e)
  }
  const applied = []
  for (const [abs, list] of byFile) {
    const text = fs.readFileSync(abs, 'utf8')
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    const lines = text.split(/\r?\n/)
    // right-to-left per line so columns stay valid
    list.sort((a, b) => a.line - b.line || b.column - a.column)
    for (const e of list) {
      const idx = e.line - 1
      const ln = lines[idx]
      const at = e.column - 1
      if (ln.substr(at, e.url.length) !== e.url) continue
      lines[idx] = ln.slice(0, at) + e.replacement + ln.slice(at + e.url.length)
      applied.push({ date: today, file: e.file, line: e.line, literal: e.url, name: e.entry.name, replacement: e.replacement })
    }
    fs.writeFileSync(abs, lines.join(eol))
  }
  applied.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return applied
}

const mono = (s) => '`+' + s + '+`'

function appendChangeLog (file, applied) {
  if (!applied.length) return
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : CHANGES_HEADER
  if (!text.endsWith('\n')) text += '\n'
  const date = applied[0].date
  const lastHeading = (text.match(/^== .*$/gm) || []).pop()
  if (lastHeading !== `== ${date}`) text += `\n== ${date}\n\n`
  for (const a of applied) text += `* ${mono(a.file + ':' + a.line)} - ${mono(a.literal)} -> ${mono(a.replacement)}\n`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

module.exports = { applyFixes, appendChangeLog, CHANGES_HEADER }
