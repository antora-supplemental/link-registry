'use strict'

// Config: package.json "linkRegistry" key, overridden by CLI flags.

const fs = require('fs')
const path = require('path')

const DEFAULTS = {
  registry: null, // string | string[]; null = autodetect
  roots: null, // null = ['docs'] if present, else ['.']
  prefix: 'url-',
  changes: 'docs/link-registry-changes.adoc',
  includeBlocks: false,
  strict: false
}

const AUTODETECT = ['docs/link-registry.adoc', 'antora-playbook.yml', 'docs/antora.yml']

function readPkgConfig (cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
    return pkg.linkRegistry || {}
  } catch { return {} }
}

function resolveConfig (cwd, overrides = {}) {
  const cfg = { ...DEFAULTS, ...readPkgConfig(cwd) }
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined && v !== null) cfg[k] = v
  let reg = cfg.registry
  if (reg == null || (Array.isArray(reg) && !reg.length)) reg = AUTODETECT.filter((f) => fs.existsSync(path.join(cwd, f)))
  cfg.registry = Array.isArray(reg) ? reg : [reg]
  let roots = cfg.roots
  if (roots == null || (Array.isArray(roots) && !roots.length)) roots = fs.existsSync(path.join(cwd, 'docs')) ? ['docs'] : ['.']
  cfg.roots = Array.isArray(roots) ? roots : [roots]
  return cfg
}

module.exports = { resolveConfig, DEFAULTS, AUTODETECT }
