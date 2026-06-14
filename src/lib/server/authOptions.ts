import type { NextAuthOptions, Session, User } from 'next-auth'
import type { AdapterUser } from 'next-auth/adapters'
import CredentialsProvider from 'next-auth/providers/credentials'
import type { JWT } from 'next-auth/jwt'
import { normalizeRole } from '@/lib/roles'
import { resolveRobaPersonnelLinkForUser } from '@/lib/roba-personal/resolvePersonnelLink'
import { verifyPasswordWithMigration } from '@/lib/server/passwords'
import { ensureNextAuthEnv } from '@/lib/server/ensureNextAuthEnv'

ensureNextAuthEnv()

const normLower = (s?: string) => (s || '').toString().trim().toLowerCase()

interface FirestoreUser {
  userId?: string
  name?: string
  password?: string
  role?: string
  isAdmin?: boolean
  department?: string
  commercialName?: string
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  isTransportLead?: boolean
  opsProjectsConfigurable?: boolean
}

async function getFirestore() {
  const { firestoreAdmin } = await import('@/lib/firebaseAdmin')
  return firestoreAdmin
}

export const authOptions: NextAuthOptions = {
  debug: false,
  trustHost: true,
  providers: [
    CredentialsProvider({
      name: 'Usuari i Contrasenya (Firebase)',
      credentials: {
        username: { label: 'Usuari', type: 'text' },
        password: { label: 'Contrasenya', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) {
          return null
        }

        const usernameRaw = credentials.username.toString().trim()
        const usernameFold = normLower(usernameRaw)
        const passInput = credentials.password.toString().trim()

        try {
          const firestore = await getFirestore()

          let snap = await firestore
            .collection('users')
            .where('name', '==', usernameRaw)
            .get()

          if (snap.empty) {
            snap = await firestore
              .collection('users')
              .where('nameFold', '==', usernameFold)
              .get()
          }

          if (snap.empty) {
            snap = await firestore
              .collection('users')
              .where('email', '==', usernameRaw)
              .get()
          }

          if (snap.empty) return null

          for (const doc of snap.docs) {
            const data = doc.data() as FirestoreUser
            const passDoc = (data.password || '').toString().trim()
            if (!passDoc) continue

            const passwordCheck = await verifyPasswordWithMigration(passInput, passDoc)
            if (!passwordCheck.ok) continue

            const mergeFields: Record<string, unknown> = {}
            if (!data.userId) mergeFields.userId = doc.id
            if (Object.keys(mergeFields).length > 0) {
              await doc.ref.set(mergeFields, { merge: true })
            }

            const roleNorm = normalizeRole(data.role)
            const isAdmin = Boolean(data.isAdmin || roleNorm === 'admin')
            const department = (data.department || '').toString().trim()

            return {
              id: data.userId || doc.id,
              name: data.name || '',
              commercialName: data.commercialName || '',
              role: isAdmin ? 'admin' : roleNorm,
              isAdmin,
              department,
              deptLower: normLower(department),
              canRespondSurveys: Boolean(data.canRespondSurveys),
              isDepartmentRobaLead: Boolean(data.isDepartmentRobaLead),
              isTransportLead: Boolean(data.isTransportLead),
              opsProjectsConfigurable:
                typeof data.opsProjectsConfigurable === 'boolean'
                  ? data.opsProjectsConfigurable
                  : true,
            }
          }
        } catch (err) {
          console.error('[AUTH] Error inesperat a authorize:', err)
          return null
        }

        return null
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: AdapterUser | User }) {
      if (user) {
        const u = user as User & {
          id: string
          role?: string
          isAdmin?: boolean
          department?: string
          canRespondSurveys?: boolean
          commercialName?: string
          isDepartmentRobaLead?: boolean
          isTransportLead?: boolean
          opsProjectsConfigurable?: boolean
        }

        token.sub = u.id
        token.isAdmin = Boolean(u.isAdmin || normalizeRole(u.role) === 'admin')
        token.role = token.isAdmin ? 'admin' : normalizeRole(u.role)
        token.department = u.department || ''
        token.deptLower = normLower(token.department)
        token.canRespondSurveys = Boolean(u.canRespondSurveys)
        token.commercialName = u.commercialName || ''
        token.isDepartmentRobaLead = Boolean(u.isDepartmentRobaLead)
        ;(token as JWT & { isTransportLead?: boolean }).isTransportLead = Boolean(u.isTransportLead)
        token.opsProjectsConfigurable =
          typeof u.opsProjectsConfigurable === 'boolean' ? u.opsProjectsConfigurable : true
        token.robaPersonnelLinkResolved = false
      }

      token.isAdmin = Boolean(token.isAdmin || normalizeRole(String(token.role || '')) === 'admin')
      if (token.role) {
        token.role = token.isAdmin ? 'admin' : normalizeRole(String(token.role))
      }
      if (!token.deptLower && token.department) {
        token.deptLower = normLower(token.department)
      }

      const uid = String(token.sub || '').trim()
      if (uid && !token.robaPersonnelLinkResolved) {
        token.robaPersonnelLinkResolved = true
        try {
          const link = await resolveRobaPersonnelLinkForUser(uid)
          token.robaLinkedPersonnelId = link?.personnelId ?? null
          token.robaWorkerDeptNorm = link?.workerDeptNorm ?? null
        } catch {
          token.robaLinkedPersonnelId = null
          token.robaWorkerDeptNorm = null
        }
      }

      if (uid && typeof token.opsProjectsConfigurable !== 'boolean') {
        try {
          const firestore = await getFirestore()
          const snap = await firestore.collection('users').doc(uid).get()
          const data = snap.exists ? (snap.data() as FirestoreUser) : null
          token.opsProjectsConfigurable =
            typeof data?.opsProjectsConfigurable === 'boolean' ? data.opsProjectsConfigurable : true
        } catch {
          token.opsProjectsConfigurable = true
        }
      }

      return token
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub as string,
          role: token.role,
          isAdmin: token.isAdmin,
          department: token.department,
          deptLower: token.deptLower,
          canRespondSurveys: Boolean(token.canRespondSurveys),
          commercialName: token.commercialName,
          isDepartmentRobaLead: Boolean(token.isDepartmentRobaLead),
          isTransportLead: Boolean((token as JWT & { isTransportLead?: boolean }).isTransportLead),
          opsProjectsConfigurable:
            typeof token.opsProjectsConfigurable === 'boolean' ? token.opsProjectsConfigurable : true,
          robaLinkedPersonnelId: token.robaLinkedPersonnelId ?? null,
          robaWorkerDeptNorm: token.robaWorkerDeptNorm ?? null,
        },
      }
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
}
