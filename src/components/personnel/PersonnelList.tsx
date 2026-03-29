'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePersonnel, Personnel } from '@/hooks/usePersonnel'
import {
  GraduationCap,
  Truck,
  User,
  Car,
  Phone,
  AtSign,
  Pencil,
  Trash2,
  UserPlus,
  Clock,
  CheckCircle2,
  XCircle,
  UtensilsCrossed
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* 🎨 Icones de rol */
const roleIcon: Record<string, React.ReactNode> = {
  responsable: <GraduationCap className="text-blue-700" size={18} />,
  driver: <Truck className="text-orange-500" size={18} />,
  treballador: <User className="text-green-600" size={18} />,
}

/* 🎨 Icona vehicle */
function VehicleIcon({ type }: { type?: string }) {
  if (!type) return null
  const t = type.toLowerCase()

  if (t === 'camiogran')
    return <Truck className="w-4 h-4 text-blue-800" />

  if (t === 'camiopetit')
    return <Truck className="w-4 h-4 text-green-700" />

  if (t === 'furgoneta')
    return <Car className="w-4 h-4 text-orange-600" />

  return <Truck className="w-4 h-4 text-gray-500" />
}

/* 🎨 Colors franja departament */
const deptColor = (dept?: string) => {
  const d = (dept || '').toLowerCase()
  if (d.includes('log')) return 'bg-blue-500'
  if (d.includes('cuina')) return 'bg-green-500'
  if (d.includes('serve')) return 'bg-purple-500'
  if (d.includes('food')) return 'bg-pink-500'
  return 'bg-gray-300'
}

type Props = {
  personnel: Personnel[]
  mutate: () => void
  onEdit?: (p: Personnel) => void
}

export default function PersonnelList({ personnel, mutate, onEdit }: Props) {
  const { deletePersonnel, requestUser } = usePersonnel()
  const [loadingMap, setLoadingMap] = React.useState<Record<string, boolean>>({})
  const today = new Date().toISOString().slice(0, 10)

  // 🔥 Accions
  async function handleDelete(p: Personnel) {
    if (!confirm(`Segur que vols eliminar ${p.name || p.id}?`)) return
    try {
      setLoadingMap((m) => ({ ...m, [p.id]: true }))
      await deletePersonnel(p.id)
      mutate()
    } finally {
      setLoadingMap((m) => ({ ...m, [p.id]: false }))
    }
  }

  async function handleRequestUser(p: Personnel) {
    const missing: string[] = []
    if (!p.name?.trim()) missing.push('nom')
    if (!p.role?.toString().trim()) missing.push('rol')
    if (!p.department?.toString().trim()) missing.push('departament')
    if (!p.email?.toString().trim()) missing.push('email')
    if (!p.phone?.toString().trim()) missing.push('telèfon')
    const deptLower = (p.department || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    const isServeis = deptLower.includes('servei')
    if (p.driver?.isDriver && !isServeis) {
      const hasType = p.driver.camioGran || p.driver.camioPetit
      if (!hasType) missing.push('tipus conductor')
    }
    if (missing.length) {
      alert(
        `Falten camps obligatoris per demanar usuari: ${missing.join(', ')}`
      )
      return
    }

    try {
      setLoadingMap((m) => ({ ...m, [p.id]: true }))
      await requestUser(p.id)
      mutate()
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No s'ha pogut sol·licitar l'usuari"
      alert(msg)
    } finally {
      setLoadingMap((m) => ({ ...m, [p.id]: false }))
    }
  }

  if (!personnel?.length) {
    return <p className="text-gray-500 text-center py-6">No hi ha personal.</p>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {personnel.map((p) => {
        const isLoading = !!loadingMap[p.id]
        const role = (p.role || '').toLowerCase()
        const unavailableUntil = (p.unavailableUntil || '').toString().trim()
        const isIndefinite = p.unavailableIndefinite === true
        const isUnavailable = p.available === false
        const isExpired =
          isUnavailable && !isIndefinite && unavailableUntil && unavailableUntil <= today

        return (
          <div
            key={p.id}
            className="relative rounded-2xl bg-white shadow-sm hover:shadow-md transition border border-gray-200 p-3"
          >
            {/* Franja lateral */}
            <div
              className={cn(
                'absolute left-0 top-0 h-full w-1 rounded-l-2xl',
                deptColor(p.department)
              )}
            />
            <div className="pl-3">

            {/* Línia superior */}
            <div className="flex items-start justify-between gap-2">
              {/* Identitat */}
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gray-50 border flex items-center justify-center text-gray-700 font-semibold">
                  {p.name?.[0]?.toUpperCase() || <User size={14} />}
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900">{p.name}</span>
                    {roleIcon[role] || roleIcon['treballador']}
                  </div>
                  <span className="text-xs text-gray-500">{p.department}</span>
                </div>
              </div>

              {/* Botons */}
              <div className="flex items-center gap-1">
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(p)}
                    className="text-orange-600 hover:bg-orange-50 rounded-full"
                  >
                    <Pencil size={15} />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(p)}
                  disabled={isLoading}
                  className="text-red-600 hover:bg-red-50 rounded-full"
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>

            {/* Línia info */}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={p.available ? 'success' : 'destructive'}>
                {p.available ? 'Disponible' : 'No disponible'}
              </Badge>

              {p.driver?.isDriver && (
                <Badge variant="secondary" className="gap-1">
                  <div className="flex items-center gap-1">
                    {p.driver.camioGran && <VehicleIcon type="camioGran" />}
                    {p.driver.camioPetit && <VehicleIcon type="camioPetit" />}
                    {!p.driver.camioGran && !p.driver.camioPetit && (
                      <VehicleIcon type="furgoneta" />
                    )}
                  </div>
                  Conductor
                </Badge>
              )}

              {p.isJamonero && (
                <Badge className="gap-1 border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">
                  <UtensilsCrossed size={12} />
                  Tallador de pernil
                </Badge>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
              {p.phone && (
                <span className="flex items-center gap-1 text-gray-600">
                  <Phone size={12} /> {p.phone}
                </span>
              )}

              {p.email && (
                <span className="flex items-center gap-1 text-gray-600 truncate max-w-[160px]">
                  <AtSign size={12} />
                  <span className="truncate">{p.email}</span>
                </span>
              )}
            </div>

            {isUnavailable && (
              <div className="mt-2 text-xs text-gray-600">
                {isIndefinite
                  ? 'No disponible (indefinit)'
                  : unavailableUntil
                  ? `No disponible fins ${unavailableUntil}`
                  : 'No disponible'}
                {isExpired && <span className="text-red-600"> (caducat)</span>}
              </div>
            )}

            {/* Estat usuari */}
            <div className="mt-2 border-t border-gray-100 pt-1">
              {p.hasUser && (
                <div className="flex items-center gap-2 text-green-600 text-xs font-medium">
                  <CheckCircle2 size={16} /> Usuari creat
                </div>
              )}

              {!p.hasUser && p.requestStatus === 'pending' && (
                <div className="flex items-center gap-2 text-blue-600 text-xs font-medium">
                  <Clock size={16} /> Sol·licitud pendent
                </div>
              )}

              {!p.hasUser && p.requestStatus === 'rejected' && (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-red-600 text-xs font-medium">
                    <XCircle size={16} /> Sol·licitud rebutjada
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 flex items-center gap-1"
                    disabled={isLoading}
                    onClick={() => handleRequestUser(p)}
                  >
                    <UserPlus size={14} />
                    Tornar a sol·licitar
                  </Button>
                </div>
              )}

              {!p.hasUser && p.requestStatus === 'approved' && (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-amber-600 text-xs font-medium">
                    <XCircle size={16} /> Usuari eliminat
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 flex items-center gap-1"
                    disabled={isLoading}
                    onClick={() => handleRequestUser(p)}
                  >
                    <UserPlus size={14} />
                    Sol·licitar usuari
                  </Button>
                </div>
              )}

              {!p.hasUser && p.requestStatus === 'none' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1"
                  disabled={isLoading}
                  onClick={() => handleRequestUser(p)}
                >
                  <UserPlus size={14} />
                  Sol·licitar usuari
                </Button>
              )}
            </div>
          </div>
          </div>
        )
      })}
    </div>
  )
}

