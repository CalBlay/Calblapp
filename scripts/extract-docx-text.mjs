import fs from 'fs'
import { inflateRawSync } from 'zlib'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node extract-docx-text.mjs <path-to-docx>')
  process.exit(1)
}

const buf = fs.readFileSync(filePath)

function readUInt32LE(b, off) {
  return b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)
}

function readUInt16LE(b, off) {
  return b[off] | (b[off + 1] << 8)
}

function parseZipEntries(data) {
  const entries = new Map()
  let offset = 0
  while (offset < data.length - 4) {
    const sig = readUInt32LE(data, offset)
    if (sig === 0x04034b50) {
      const compMethod = readUInt16LE(data, offset + 8)
      const compSize = readUInt32LE(data, offset + 18)
      const uncompSize = readUInt32LE(data, offset + 22)
      const nameLen = readUInt16LE(data, offset + 26)
      const extraLen = readUInt16LE(data, offset + 28)
      const name = data.slice(offset + 30, offset + 30 + nameLen).toString('utf8')
      const dataStart = offset + 30 + nameLen + extraLen
      const compData = data.slice(dataStart, dataStart + compSize)
      let content
      if (compMethod === 0) content = compData
      else if (compMethod === 8) content = inflateRawSync(compData)
      else throw new Error(`Unsupported compression ${compMethod} for ${name}`)
      entries.set(name, content)
      offset = dataStart + compSize
      continue
    }
    if (sig === 0x02014b50) break
    offset++
  }
  return entries
}

const entries = parseZipEntries(buf)
const xmlEntry = entries.get('word/document.xml')
if (!xmlEntry) {
  console.error('word/document.xml not found in docx')
  process.exit(1)
}

const xml = xmlEntry.toString('utf8')
const paragraphs = xml.split(/<w:p[\s>]/).slice(1)
const lines = []

for (const p of paragraphs) {
  const runs = []
  const textRe = /<w:t[^>]*>([^<]*)<\/w:t>/g
  let m
  while ((m = textRe.exec(p)) !== null) runs.push(m[1])
  if (p.includes('<w:tab')) runs.push('\t')
  const line = runs.join('').trimEnd()
  if (line) lines.push(line)
}

// Tables
const tableRe = /<w:tbl[\s\S]*?<\/w:tbl>/g
let tbl
while ((tbl = tableRe.exec(xml)) !== null) {
  lines.push('\n--- TABLE ---')
  const rowRe = /<w:tr[\s\S]*?<\/w:tr>/g
  let row
  while ((row = rowRe.exec(tbl[0])) !== null) {
    const cells = []
    const cellRe = /<w:tc[\s\S]*?<\/w:tc>/g
    let cell
    while ((cell = cellRe.exec(row[0])) !== null) {
      const cellTexts = []
      const cellTextRe = /<w:t[^>]*>([^<]*)<\/w:t>/g
      let cm
      while ((cm = cellTextRe.exec(cell[0])) !== null) cellTexts.push(cm[1])
      cells.push(cellTexts.join('').trim())
    }
    if (cells.some(Boolean)) lines.push(cells.join('\t'))
  }
}

console.log(lines.join('\n'))
