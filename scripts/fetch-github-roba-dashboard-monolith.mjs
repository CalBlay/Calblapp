/**
 * Downloads RobaPersonalDashboard.tsx from the Calblapp GitHub repo (git blob API),
 * decodes base64, writes a monolith file you can pass to assemble-roba-panels.mjs.
 *
 * Run from Command Prompt (outside Cursor if PowerShell is blocked):
 *   cd c:\dev\cal-blay-webapp
 *   node scripts/fetch-github-roba-dashboard-monolith.mjs
 *
 * Override blob URL (optional):
 *   node scripts/fetch-github-roba-dashboard-monolith.mjs "https://api.github.com/repos/CalBlay/Calblapp/git/blobs/<sha>"
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outPath = path.join(root, 'src/app/menu/roba-personal/RobaPersonalDashboard.monolith.github.tsx')

const defaultBlobUrl =
  'https://api.github.com/repos/CalBlay/Calblapp/git/blobs/493e03fe8bcd8ef15413332db182a5bcd374fa1c'

const blobUrl = process.argv[2] || defaultBlobUrl

const res = await fetch(blobUrl, {
  headers: {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cal-blay-webapp-assemble',
  },
})
if (!res.ok) {
  console.error(res.status, await res.text())
  process.exit(1)
}
const j = await res.json()
if (j.encoding !== 'base64' || typeof j.content !== 'string') {
  console.error('Unexpected blob payload', j)
  process.exit(1)
}
const b64 = j.content.replace(/\r?\n/g, '')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, Buffer.from(b64, 'base64').toString('utf8'), 'utf8')
const lines = fs.readFileSync(outPath, 'utf8').split(/\r?\n/)
console.log('Wrote', outPath)
console.log('Lines:', lines.length)
console.log('First line:', lines[0] || '(empty)')
