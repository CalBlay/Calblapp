import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('src')
const from = "@/app/api/auth/[...nextauth]/route"
const to = "@/lib/server/authOptions"

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

let changed = 0
for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8')
  if (!text.includes(from)) continue
  const next = text.split(from).join(to)
  if (next !== text) {
    fs.writeFileSync(file, next)
    changed++
    console.log('updated', file)
  }
}

console.log(`done: ${changed} files`)
