'use client'

import React, { useState, useEffect, FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreatePersonnel, NewPerson } from '@/hooks/useCreatePersonnel'
import { checkNameExists, generateSuggestions } from '@/lib/validateName'

type LinkableUser = {
  id: string
  name: string
  role: string
  department: string
  email: string
  phone: string
  available: boolean
  isDriver: boolean
  isJamonero?: boolean
  workerRank: string
}

// Opcions de rol permeses
const ROLE_OPTIONS = [
  { value: 'equip', label: 'Equip' },
  { value: 'responsable', label: 'Responsable' },
]

// Normalització rol
function normalizeRoleLocal(r?: string) {
  const v = (r || '').toLowerCase()
  return v === 'responsable' ? 'responsable' : 'equip'
}

function mapUserRoleToPersonnelRole(role?: string) {
  const value = (role || '').toLowerCase().trim()
  return value === 'cap departament' || value === 'cap' || value === 'responsable'
    ? 'responsable'
    : 'equip'
}

// Slug senzill
function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// ID auto
function randSuffix(len = 4) {
  return Math.random().toString(36).slice(2, 2 + len)
}
function generateIdFromName(name: string) {
  const base = slugify(name) || 'persona'
  return `${base}-${randSuffix()}`
}

interface NewPersonnelModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  defaultDepartment?: string
}

export default function NewPersonnelModal({
  isOpen,
  onOpenChange,
  onCreated,
  defaultDepartment = ''
}: NewPersonnelModalProps) {
  const { mutateAsync, loading: isCreating, error } = useCreatePersonnel()
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowIso = tomorrow.toISOString().slice(0, 10)
  const computeMinUnavailableUntil = (from?: string) => {
    const base = (from || today).trim()
    const parsed = new Date(base)
    if (Number.isNaN(parsed.getTime())) return tomorrowIso
    parsed.setDate(parsed.getDate() + 1)
    const baseIso = parsed.toISOString().slice(0, 10)
    return baseIso > tomorrowIso ? baseIso : tomorrowIso
  }

  const [autoId, setAutoId] = useState(true)

  const [form, setForm] = useState<NewPerson>({
    id: '',
    name: '',
    role: 'equip',
    department: defaultDepartment,
    driver: { isDriver: false, camioGran: false, camioPetit: false },
    isJamonero: false,
    available: true,
    unavailableFrom: '',
    unavailableUntil: '',
    unavailableIndefinite: false,
    email: '',
    phone: '',
    maxHoursWeek: 40,
  })

  const isServicesDepartment = (form.department || defaultDepartment).toLowerCase().trim()
  const usesServicesDepartment =
    isServicesDepartment === 'serveis' ||
    isServicesDepartment === 'servei' ||
    isServicesDepartment === 'manteniment'
  const isServiceOnlyDepartment =
    isServicesDepartment === 'serveis' || isServicesDepartment === 'servei'

  const [nameError, setNameError] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [linkableUsers, setLinkableUsers] = useState<LinkableUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)

  // Reinici al obrir modal
  useEffect(() => {
    if (isOpen) {
      setAutoId(true)
      setForm({
        id: '',
        name: '',
        role: 'equip',
        department: defaultDepartment,
        driver: { isDriver: false, camioGran: false, camioPetit: false },
        isJamonero: false,
        available: true,
        unavailableFrom: '',
        unavailableUntil: '',
        unavailableIndefinite: false,
        email: '',
        phone: '',
        maxHoursWeek: 40,
      })
      setNameError(false)
      setSuggestions([])
      setAvailabilityError(null)
      setSelectedUserId('')
    }
  }, [isOpen, defaultDepartment])

  useEffect(() => {
    if (!isOpen) return

    const controller = new AbortController()

    const loadUsers = async () => {
      try {
        setLoadingUsers(true)
        const params = new URLSearchParams()
        if (defaultDepartment) params.set('department', defaultDepartment)
        const res = await fetch(`/api/personnel/linkable-users?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'No s’han pogut carregar els usuaris')
        setLinkableUsers(Array.isArray(json?.data) ? json.data : [])
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        console.error('Error carregant usuaris vinculables', err)
        setLinkableUsers([])
      } finally {
        setLoadingUsers(false)
      }
    }

    loadUsers()
    return () => controller.abort()
  }, [isOpen, defaultDepartment])

  // Actualitza ID automàticament
  useEffect(() => {
    if (autoId) {
      setForm(prev => ({ ...prev, id: generateIdFromName(prev.name) }))
    }
  }, [form.name, autoId])

  // Validar nom
  const validateName = async (v: string) => {
    if (!v.trim()) {
      setNameError(false)
      setSuggestions([])
      return
    }

    const exists = await checkNameExists(v)
    setNameError(exists)

    if (exists) {
      setSuggestions(generateSuggestions(v))
    } else {
      setSuggestions([])
    }
  }

  const handleChange = <K extends keyof NewPerson>(field: K, value: NewPerson[K]) => {
    if (field === 'available' || field === 'unavailableUntil' || field === 'unavailableIndefinite') {
      setAvailabilityError(null)
    }
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSelectExistingUser = async (userId: string) => {
    setSelectedUserId(userId)

    if (!userId) {
      setAutoId(true)
      setForm((prev) => ({ ...prev, id: generateIdFromName(prev.name) }))
      setNameError(false)
      setSuggestions([])
      return
    }

    const selectedUser = linkableUsers.find((user) => user.id === userId)
    if (!selectedUser) return

    setAutoId(false)
    setForm((prev) => ({
      ...prev,
      id: selectedUser.id,
      name: selectedUser.name || '',
      role: mapUserRoleToPersonnelRole(selectedUser.role),
      department: selectedUser.department || defaultDepartment,
      driver: {
        isDriver: selectedUser.isDriver,
        camioGran: false,
        camioPetit: false,
      },
      isJamonero: selectedUser.isJamonero === true,
      available: selectedUser.available ?? true,
      unavailableFrom: '',
      unavailableUntil: '',
      unavailableIndefinite: false,
      email: selectedUser.email || '',
      phone: selectedUser.phone || '',
      maxHoursWeek: prev.maxHoursWeek ?? 40,
    }))
    await validateName(selectedUser.name || '')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (nameError) return

    const isUnavailable = form.available === false
    const endDate = (form.unavailableUntil || '').trim()
    if (isUnavailable && !form.unavailableIndefinite && !endDate) {
      setAvailabilityError('Cal indicar una data o marcar indefinit.')
      return
    }
    const minEndDate = computeMinUnavailableUntil(form.unavailableFrom || '')
    if (
      isUnavailable &&
      !form.unavailableIndefinite &&
      endDate &&
      endDate < minEndDate
    ) {
      setAvailabilityError(`La data ha de ser com a minim ${minEndDate}.`)
      return
    }

    const availabilityPayload = isUnavailable
      ? {
          unavailableFrom: (form.unavailableFrom || today).trim(),
          unavailableUntil: form.unavailableIndefinite ? null : endDate,
          unavailableIndefinite: form.unavailableIndefinite === true,
          unavailableNotifiedFor: null,
          unavailableNotifiedAt: null,
        }
      : {
          unavailableFrom: null,
          unavailableUntil: null,
          unavailableIndefinite: false,
        }

    const payload: NewPerson = {
      ...form,
      id: form.id.trim(),
      name: form.name.trim(),
      role: normalizeRoleLocal(form.role),
      department: form.department.trim(),
      isJamonero: form.isJamonero === true,
      email: form.email.trim(),
      phone: form.phone.trim(),
      ...availabilityPayload,
    }

    await mutateAsync(payload)
    onCreated()
    onOpenChange(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nou treballador</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <Label htmlFor="existing-user">Usuari existent</Label>
            <select
              id="existing-user"
              value={selectedUserId}
              onChange={(e) => {
                void handleSelectExistingUser(e.target.value)
              }}
              className="border rounded px-2 py-1 w-full"
            >
              <option value="">Crear fitxa nova</option>
              {linkableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} · {user.department || defaultDepartment || 'Sense departament'}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {loadingUsers
                ? 'Carregant usuaris disponibles...'
                : 'Si selecciones un usuari existent, la fitxa de personal es crearà amb el mateix ID.'}
            </p>
          </div>

          {/* NOM */}
          <div>
            <Label htmlFor="name">Nom complet</Label>
            <Input
              id="name"
              value={form.name}
              onChange={async (e) => {
                const v = e.target.value
                handleChange('name', v)
                await validateName(v)
              }}
              required
              disabled={Boolean(selectedUserId)}
              className={nameError ? 'border-red-500' : ''}
            />

            {nameError && (
              <div className="mt-1 text-red-600 text-sm flex flex-col gap-2">
                <div>⚠️ El nom ja existeix.</div>
                <div className="flex gap-2 flex-wrap">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={async () => {
                        handleChange('name', s)
                        await validateName(s)
                      }}
                      className="px-2 py-1 bg-gray-100 rounded-lg text-xs border hover:bg-gray-200"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ID AUTO */}
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="id">ID (auto)</Label>
              <Button
                type="button"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setForm(prev => ({ ...prev, id: generateIdFromName(prev.name) }))}
              >
                Regenera
              </Button>
            </div>
            <Input id="id" value={form.id} disabled className="bg-gray-100" />
            <p className="text-xs text-gray-500">
              {selectedUserId
                ? 'Aquest ID coincideix amb el de l’usuari existent.'
                : 'L’ID també s’utilitzarà per crear l’usuari.'}
            </p>
          </div>

          {/* ROL */}
          <div>
            <Label>Rol</Label>
            <select
              value={form.role}
              onChange={e => handleChange('role', e.target.value)}
              className="border rounded px-2 py-1 w-full"
            >
              {ROLE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* DEPARTAMENT */}
          <div>
            <Label>Departament</Label>
            <Input value={form.department} disabled className="bg-gray-100" />
          </div>

          {/* CONDUCTOR */}
          <div>
            <Label>És conductor?</Label>
              <select
                value={form.driver?.isDriver ? 'si' : 'no'}
                onChange={(e) => {
                  const isDriver = e.target.value === 'si'
                  handleChange('driver', {
                    ...form.driver,
                    isDriver,
                    camioGran: usesServicesDepartment ? false : form.driver?.camioGran ?? false,
                    camioPetit: usesServicesDepartment ? false : form.driver?.camioPetit ?? false,
                  })
                }}
                className="border rounded px-2 py-1 w-full"
              >
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </div>

          {/* TIPUS VEHICLE */}
          {form.driver?.isDriver && !usesServicesDepartment && (
            <div>
              <Label>Tipus de vehicle</Label>
              <div className="flex flex-col gap-2 mt-1">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.driver.camioGran}
                    onChange={(e) =>
                      handleChange('driver', { ...form.driver, camioGran: e.target.checked })
                    }
                  />
                  Camió gran
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.driver.camioPetit}
                    onChange={(e) =>
                      handleChange('driver', { ...form.driver, camioPetit: e.target.checked })
                    }
                  />
                  Camió petit
                </label>
              </div>
            </div>
          )}

          {/* DISPONIBLE */}
          <div>
            <Label>Disponible</Label>
            <select
              value={form.available ? 'si' : 'no'}
              onChange={(e) => {
                const isAvailable = e.target.value === 'si'
                setAvailabilityError(null)
                if (isAvailable) {
                  setForm((prev) => ({
                    ...prev,
                    available: true,
                    unavailableFrom: '',
                    unavailableUntil: '',
                    unavailableIndefinite: false,
                  }))
                  return
                }
                setForm((prev) => ({
                  ...prev,
                  available: false,
                  unavailableFrom: prev.unavailableFrom || today,
                }))
              }}
              className="border rounded px-2 py-1 w-full"
            >
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </div>

          {!form.available && (
            <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-600">Indisponibilitat</div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.unavailableIndefinite ?? false}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setAvailabilityError(null)
                    setForm((prev) => ({
                      ...prev,
                      unavailableIndefinite: checked,
                      unavailableUntil: checked ? '' : prev.unavailableUntil,
                    }))
                  }}
                />
                Indefinit
              </label>

              <div>
                <Label htmlFor="unavailableUntil">Fins a</Label>
                <Input
                  id="unavailableUntil"
                  type="date"
                  value={form.unavailableUntil || ''}
                  onChange={(e) => handleChange('unavailableUntil', e.target.value as any)}
                  disabled={form.unavailableIndefinite === true}
                  min={computeMinUnavailableUntil(form.unavailableFrom || '')}
                />
              </div>

              <p className="text-xs text-gray-500">
                Des de: {form.unavailableFrom || today}
              </p>

              {availabilityError && (
                <p className="text-xs text-red-600">{availabilityError}</p>
              )}
            </div>
          )}

          {isServiceOnlyDepartment && (
            <div>
              <Label>És tallador de pernil?</Label>
              <select
                value={form.isJamonero ? 'si' : 'no'}
                onChange={(e) => handleChange('isJamonero', e.target.value === 'si')}
                className="border rounded px-2 py-1 w-full"
              >
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </div>
          )}

          {/* CONTACTE */}
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={e => handleChange('email', e.target.value)}
            />
          </div>

          <div>
            <Label>Telèfon</Label>
            <Input
              type="tel"
              value={form.phone}
              onChange={e => handleChange('phone', e.target.value)}
            />
          </div>

          {/* HORES SETMANALS */}
          <div>
            <Label>Hores màximes per setmana</Label>
            <Input
              type="number"
              min={0}
              value={form.maxHoursWeek}
              onChange={e => handleChange('maxHoursWeek', Number(e.target.value))}
            />
          </div>

          {/* BOTONS */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel·lar
            </Button>

            <Button
              type="submit"
              disabled={isCreating || nameError}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isCreating ? 'Creant…' : 'Crear'}
            </Button>
          </div>

          {error && <p className="text-red-600 mt-2">{error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}
