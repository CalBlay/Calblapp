import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { join } from 'path'

const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || join(process.cwd(), 'serviceAccountKey.json')
const credentials = JSON.parse(readFileSync(keyPath, 'utf8'))

const jwtClient = new google.auth.JWT(
  credentials.client_email,
  undefined,
  credentials.private_key,
  ['https://www.googleapis.com/auth/spreadsheets.readonly']
)

export const sheets = (google as any).sheets({ version: 'v4', auth: jwtClient })
