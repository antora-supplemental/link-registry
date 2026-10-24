'use strict'

// Antora entry point (`require: '@antora-supplemental/link-registry'`) plus the library API.

const { register } = require('./extension')
const registry = require('./registry')
const scan = require('./scan')
const normalize = require('./normalize')
const { runCheck, suggest } = require('./check')
const { applyFixes, appendChangeLog } = require('./fix')
const { resolveConfig } = require('./config')

module.exports = { register, ...registry, ...scan, ...normalize, runCheck, suggest, applyFixes, appendChangeLog, resolveConfig }
