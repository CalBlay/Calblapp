// File: src/components/personnel/EditPersonnelModal.tsx
'use client'

import React, { useState, useEffect, FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useUpdatePersonnel } from '@/hooks/useUpdatePersonnel'
import { usePersonnel, Personnel } from '@/hooks/usePersonnel'
import { checkNameExists, generateSuggestions } from '@/lib/validateName'

// Opcions de rol
const ROLE_OPTIONS = [
  { value: 'equip', label: 'Equip' },
  { value: 'responsable', label: 'Responsable' },
]

function normalizeRoleLocal(r?: string) {
  const v = (r || '').toLowerCase()
  return v === 'responsable' ? 'responsable' : 'equip'
}

interface EditPersonnelModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  person: Personnel
}

export default function EditPersonnelModal({
  isOpen,
  onOpenChange,
  onSaved,
  person,
}: EditPersonnelModalProps) {
  const { mutateAsync, loading: isSaving, error } = useUpdatePersonnel()
  usePersonnel() // manté estat global en sincronització
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

  // Formulari
  const [form, setForm] = useState<Personnel>(() => ({
    ...person,
    role: normalizeRoleLocal(person.role),
    maxHoursWeek: person.maxHoursWeek ?? 40,
    driver: person.driver ?? {
      isDriver: false,
      camioGran: false,
      camioPetit: false,
    },
    isJamonero: person.isJamonero === true,
    available: person.available ?? true,
    unavailableFrom: person.unavailableFrom ?? '',
    unavailableUntil: person.unavailableUntil ?? '',
    unavailableIndefinite: person.unavailableIndefinite ?? false,
  }))
  const normalizedDept = (form.department || person.department || '').toLowerCase().trim()
  const usesServicesDepartment =
    normalizedDept === 'serveis' ||
    normalizedDept === 'servei' ||
    normalizedDept === 'manteniment'
  const isServiceOnlyDepartment =
    normalizedDept === 'serveis' || normalizedDept === 'servei'

  // Estat validació nom
  const [nameError, setNameError] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  // Reset al obrir / canviar persona
  useEffect(() => {
    if (!isOpen) return

    setForm({
      ...person,
      role: normalizeRoleLocal(person.role),
      maxHoursWeek: person.maxHoursWeek ?? 40,
      driver: person.driver ?? {
        isDriver: false,
        camioGran: false,
        camioPetit: false,
      },
      isJamonero: person.isJamonero === true,
      available: person.available ?? true,
      unavailableFrom: person.unavailableFrom ?? '',
      unavailableUntil: person.unavailableUntil ?? '',
      unavailableIndefinite: person.unavailableIndefinite ?? false,
    })
    setNameError(false)
    setSuggestions([])
    setAvailabilityError(null)
  }, [isOpen, person])

  const handleChange = <K extends keyof Personnel>(
    field: K,
    value: Personnel[K],
  ) => {
    if (field === 'available' || field === 'unavailableUntil' || field === 'unavailableIndefinite') {
      setAvailabilityError(null)
    }
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // ✅ Validació de nom (igual que NewPersonnel, però permet mantenir el seu)
  const validateName = async (newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) {
      setNameError(false)
      setSuggestions([])
      return
    }

    // Si és exactament el mateix nom (ignorant majúscules/minúscules) -> OK
    if (trimmed.toLowerCase() === (person.name || '').trim().toLowerCase()) {
      setNameError(false)
      setSuggestions([])
      return
    }

    const exists = await checkNameExists(trimmed, person.id)
    setNameError(exists)

    if (exists) {
      setSuggestions(generateSuggestions(trimmed))
    } else {
      setSuggestions([])
    }
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
          unavailableNotifiedFor: null,
          unavailableNotifiedAt: null,
        }

    const payload = {
      id: form.id,
      name: form.name?.trim(),
      role: normalizeRoleLocal(form.role),
      department: form.department,
      isJamonero: form.isJamonero === true,
      available: form.available ?? true,
      isDriver: form.driver?.isDriver ?? false,
      driver: {
        isDriver: form.driver?.isDriver ?? false,
        camioGran: form.driver?.camioGran ?? false,
        camioPetit: form.driver?.camioPetit ?? false,
      },
      email: form.email || null,
      phone: form.phone || null,
      maxHoursWeek: Number(form.maxHoursWeek || 0) || 0,
      updatedAt: Date.now(),
      ...availabilityPayload,
    }

    await mutateAsync(payload as any)

    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {person.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ID (no editable) */}
          <div>
            <Label htmlFor="id">ID</Label>
            <Input id="id" value={form.id} disabled className="bg-gray-100" />
          </div>

          {/* NOM + validació duplicats */}
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
              className={nameError ? 'border-red-500' : ''}
            />

            {nameError && (
              <div className="mt-1 text-red-600 text-sm flex flex-col gap-2">
                <div>⚠️ Ja existeix un treballador amb aquest nom.</div>

                {suggestions.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {suggestions.map((s) => (
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
                )}
              </div>
            )}
          </div>

          {/* Rol */}
          <div>
            <Label htmlFor="role">Rol</Label>
            <select
              id="role"
              value={normalizeRoleLocal(form.role)}
              onChange={(e) =>
                handleChange('role', e.target.value as Personnel['role'])
              }
              className="border rounded px-2 py-1 w-full"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Departament (no editable) */}
          <div>
            <Label htmlFor="department">Departament</Label>
            <Input
              id="department"
              value={form.department}
              disabled
              className="bg-gray-100"
            />
          </div>

          {/* Disponible */}
          <div className="flex items-center justify-between">
            <Label htmlFor="available">Disponible</Label>
            <Switch
              id="available"
              checked={form.available ?? true}
              onCheckedChange={(val) => {
                setAvailabilityError(null)
                if (val) {
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
            />
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

          {/* Conductor */}
          <div>
            <Label>És conductor?</Label>
            <select
              value={form.driver?.isDriver ? 'si' : 'no'}
              onChange={(e) => {
                const isDriver = e.target.value === 'si'
                handleChange('driver', {
                 ...(form.driver ?? {
                    camioGran: false,
                    camioPetit: false,
                  }),
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

          {/* Tipus vehicle */}
          {form.driver?.isDriver && !usesServicesDepartment && (
            <div>
              <Label>Tipus de vehicle</Label>
              <div className="flex flex-col gap-2 mt-1">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.driver?.camioGran || false}
                    onChange={(e) =>
                      handleChange('driver', {
                       ...(form.driver ?? { isDriver: true, camioGran: false, camioPetit: false }),
camioGran: e.target.checked,

                      })
                    }
                  />
                  Camió gran
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.driver?.camioPetit || false}
                    onChange={(e) =>
                      handleChange('driver', {
                      ...(form.driver ?? { isDriver: true, camioGran: false, camioPetit: false }),
camioPetit: e.target.checked,

                      })
                    }
                  />
                  Camió petit
                </label>
              </div>
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

          {/* Email */}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email || ''}
              onChange={(e) => handleChange('email', e.target.value)}
            />
          </div>

          {/* Telèfon */}
          <div>
            <Label htmlFor="phone">Telèfon</Label>
            <Input
              id="phone"
              type="tel"
              value={form.phone || ''}
              onChange={(e) => handleChange('phone', e.target.value)}
            />
          </div>

          {/* Hores màximes setmana */}
          <div>
            <Label htmlFor="maxHoursWeek">Hores màximes per setmana</Label>
            <Input
              id="maxHoursWeek"
              type="number"
              min={0}
              value={form.maxHoursWeek ?? 40}
              onChange={(e) =>
                handleChange('maxHoursWeek', Number(e.target.value) || 0)
              }
            />
          </div>

          {/* Botons */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="ghost"
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel·lar
            </Button>
            <Button
              type="submit"
              disabled={isSaving || nameError}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSaving ? 'Guardant…' : 'Guardar'}
            </Button>
          </div>

          {error && <p className="text-red-600 mt-2">{error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}
