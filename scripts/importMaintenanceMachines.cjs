const path = require('path')
const fs = require('fs')
const XLSX = require('xlsx')
const dotenv = require('dotenv')
const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

dotenv.config({ path: path.join(process.cwd(), '.env') })
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true })

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

if (!projectId || !clientEmail || !privateKey) {
  throw new Error('Falten variables FIREBASE_* per importar maquinaria')
}

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  })
}

const db = getFirestore()
const COLLECTION = 'maintenanceMachines'

const primaryPath = path.join(process.cwd(), 'scripts', 'Maquinaria.xlsx')
const fallbackPath = path.join(process.cwd(), 'public', 'Maquinaria.xlsx')
const filePath = fs.existsSync(primaryPath)
  ? primaryPath
  : fs.existsSync(fallbackPath)
  ? fallbackPath
  : null

if (!filePath) {
  throw new Error('No s ha trobat Maquinaria.xlsx a scripts ni a public')
}

function buildDocId(code, name, index) {
  const base = String(code || name || `machine-${index}`)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `machine-${index}`
}

async function run() {
  console.log(`[maintenance-machines] Llegint: ${filePath}`)

  const workbook = XLSX.readFile(filePath, { cellDates: false })
  const sheetName = workbook.SheetNames.includes('Export')
    ? 'Export'
    : workbook.SheetNames[0]
  const ws = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  const parsed = rows
    .map((row, index) => {
      const code = String(row[0] || '').trim()
      const name = String(row[1] || '').trim()
      if (!code && !name) return null
      return {
        id: buildDocId(code, name, index),
        code,
        name,
        label: code && name ? `${code} · ${name}` : code || name,
        active: true,
        importedFrom: path.basename(filePath),
      }
    })
    .filter(Boolean)

  const batchSize = 200
  let imported = 0

  for (let i = 0; i < parsed.length; i += batchSize) {
    const chunk = parsed.slice(i, i + batchSize)
    const batch = db.batch()
    const now = Date.now()

    chunk.forEach((item) => {
      const ref = db.collection(COLLECTION).doc(item.id)
      batch.set(
        ref,
        {
          code: item.code,
          name: item.name,
          label: item.label,
          active: true,
          importedFrom: item.importedFrom,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true }
      )
    })

    await batch.commit()
    imported += chunk.length
    console.log(`[maintenance-machines] Importades ${imported}/${parsed.length}`)
  }

  console.log(`[maintenance-machines] Importacio finalitzada. Total: ${parsed.length}`)
}

run().catch((error) => {
  console.error('[maintenance-machines] Error', error)
  process.exit(1)
})
