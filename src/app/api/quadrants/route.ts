import { type NextRequest } from 'next/server'
import { handlePostQuadrant } from '@/lib/quadrantsPost/handlePostQuadrant'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  return handlePostQuadrant(req)
}
