export const runtime = 'nodejs'

import NextAuth from 'next-auth'
import { authOptions } from '@/lib/server/authOptions'
import { ensureNextAuthEnv } from '@/lib/server/ensureNextAuthEnv'

ensureNextAuthEnv()

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
