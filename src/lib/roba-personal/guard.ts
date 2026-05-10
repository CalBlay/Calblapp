import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { type Role } from '@/lib/roles'
import { normDeptLabel } from '@/lib/roba-personal/deptScope'
import {
  getUserDoc,
  RRHH_DEPARTMENT_LOWER,
  userIsRecursosHumans,
} from '@/lib/roba-personal/requestPermissions'
import { resolveRobaPersonnelLinkForUser } from '@/lib/roba-personal/resolvePersonnelLink'

export type RobaPersonalAdminOk = { ok: true; userId: string; role: Role }
export type RobaPersonalAdminFail = { ok: false; res: NextResponse }

/** Accés complet (admin / RRHH): totes les APIs i pestanyes. */
export type RobaAccessFull = { scope: 'full'; userId: string; role: Role }

/** Responsable de roba de departament: només sol·licituds i entregues, dades filtrades. */
export type RobaAccessDeptLead = {
  scope: 'deptLead'
  userId: string
  role: Role
  /** `normDeptLabel` del departament de l’usuari (Firestore). */
  leadDeptNorm: string
  /** Mateix usuari pot tenir `personnel` vinculat i rebre/confirmar entregues pròpies com a treballador. */
  linkedPersonnelId?: string
  workerDeptNorm?: string
}

/** Treballador amb usuari d’app vinculat a `personnel`: veure roba i confirmar recollida / entrega pròpia. */
export type RobaAccessWorkerSelf = {
  scope: 'workerSelf'
  userId: string
  role: Role
  linkedPersonnelId: string
  workerDeptNorm: string
}

export type RobaAccess = RobaAccessFull | RobaAccessDeptLead | RobaAccessWorkerSelf

export type ResolveRobaAccessOk = { ok: true; access: RobaAccess }
export type ResolveRobaAccessFail = { ok: false; res: NextResponse }

/** Identitat per a accions de treballador (confirmació d’entrega, incidències), incloent caps amb personnel vinculat. */
export type RobaLinkedWorkerActor = {
  userId: string
  linkedPersonnelId: string
  workerDeptNorm: string
}

export function robaLinkedWorkerActor(access: RobaAccess): RobaLinkedWorkerActor | null {
  if (access.scope === 'workerSelf') {
    return {
      userId: access.userId,
      linkedPersonnelId: access.linkedPersonnelId,
      workerDeptNorm: access.workerDeptNorm,
    }
  }
  if (access.scope === 'deptLead') {
    const pid = String(access.linkedPersonnelId || '').trim()
    const wdn = String(access.workerDeptNorm || '').trim()
    if (pid && wdn) {
      return { userId: access.userId, linkedPersonnelId: pid, workerDeptNorm: wdn }
    }
  }
  return null
}

/**
 * Resol accés al mòdul Roba: administrador, RRHH (sessió o document), o responsable de roba de departament.
 */
export async function resolveRobaAccess(): Promise<ResolveRobaAccessOk | ResolveRobaAccessFail> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const role = auth.role
  const userId = auth.user.id

  if (role === 'admin') {
    return { ok: true, access: { scope: 'full', userId, role } }
  }

  const sessionDept = normDeptLabel(auth.user.department)
  if (sessionDept === RRHH_DEPARTMENT_LOWER) {
    return { ok: true, access: { scope: 'full', userId, role } }
  }

  if (await userIsRecursosHumans(userId)) {
    return { ok: true, access: { scope: 'full', userId, role } }
  }

  const u = await getUserDoc(userId)
  if (u?.isDepartmentRobaLead === true) {
    const leadDeptNorm = normDeptLabel(u.departmentLower || u.department)
    if (!leadDeptNorm) {
      return {
        ok: false,
        res: NextResponse.json(
          { error: 'Responsable de roba sense departament vàlid al perfil.' },
          { status: 403 }
        ),
      }
    }
    const link = await resolveRobaPersonnelLinkForUser(userId)
    return {
      ok: true,
      access: {
        scope: 'deptLead',
        userId,
        role,
        leadDeptNorm,
        ...(link
          ? { linkedPersonnelId: link.personnelId, workerDeptNorm: link.workerDeptNorm }
          : {}),
      },
    }
  }

  const link = await resolveRobaPersonnelLinkForUser(userId)
  if (link) {
    return {
      ok: true,
      access: {
        scope: 'workerSelf',
        userId,
        role,
        linkedPersonnelId: link.personnelId,
        workerDeptNorm: link.workerDeptNorm,
      },
    }
  }

  return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
}

/**
 * Accés complet al mòdul Roba personal (totes les APIs de gestió): administradors
 * o personal del departament Recursos Humans (sessió o document d’usuari).
 */
export async function requireRobaPersonalAdmin(): Promise<
  RobaPersonalAdminOk | RobaPersonalAdminFail
> {
  const r = await resolveRobaAccess()
  if (!r.ok) return r
  if (r.access.scope !== 'full') {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, userId: r.access.userId, role: r.access.role }
}
