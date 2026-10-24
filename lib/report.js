'use strict'

// Teaching messages + GitHub Actions annotations.

function errorMessage (e, fixCmd) {
  const how = e.kind === 'fragment'
    ? `Write ${e.replacement}[...] instead (the registered link plus this page's #fragment)`
    : `Write ${e.replacement}[...] instead`
  return `${e.file}:${e.line} uses the literal ${e.url} which is registered as {${e.entry.name}}. ${how}, or run \`${fixCmd}\`.`
}

function warningMessage (w) {
  return `${w.file}:${w.line} links ${w.url}, which looks like a typo of {${w.entry.name}} (${w.entry.url}). If it is the same page, write {${w.entry.name}}[...]; if it is a different page, register it under its own name.`
}

const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
const escProp = (s) => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C')

function annotation (level, item, title, msg) {
  return `::${level} file=${escProp(item.file)},line=${item.line},col=${item.column},title=${escProp(title)}::${esc(msg)}`
}

module.exports = { errorMessage, warningMessage, annotation }
