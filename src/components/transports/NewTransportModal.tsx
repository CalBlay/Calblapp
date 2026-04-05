'use client'

import React, { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateTransport } from '@/hooks/useCreateTransport'
import { usePersonnel } from '@/hooks/usePersonnel'
import type { Transport } from '@/hooks/useTransports'
import { storage } from '@/lib/firebaseClient'
import {
  TRANSPORT_TYPE_OPTIONS,
  type TransportType,
} from '@/lib/transportTypes'
import { compressRasterImageForUpload, DEFAULT_MAX_IMAGE_UPLOAD_BYTES } from '@/lib/file-optimization'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

const isTransportType = (value: string): value is TransportType =>
  TRANSPORT_TYPE_OPTIONS.some((option) => option.value === value)

interface NewTransportModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  defaultValues?: Transport | null
}

type TransportDocument = {
  id: string
  name: string
  url: string
  uploadedAt: string
}

type TransportPayload = {
  plate: string
  type: TransportType
  conductorId: string | null
  itvDate?: string | null
  itvExpiry?: string | null
  lastService?: string | null
  nextService?: string | null
  documents: string[]
}

export default function NewTransportModal({
  isOpen,
  onOpenChange,
  onCreated,
  defaultValues = null,
}: NewTransportModalProps) {
  const { mutateAsync, loading, error } = useCreateTransport()
  const { data: personnel } = usePersonnel()
  const isEditMode = !!defaultValues

  const [plate, setPlate] = useState('')
  const [type, setType] = useState<TransportType>('comercial')
  const [conductorId, setConductorId] = useState('')
  const [itvDate, setItvDate] = useState('')
  const [itvExpiry, setItvExpiry] = useState('')
  const [lastService, setLastService] = useState('')
  const [nextService, setNextService] = useState('')
  const [documents, setDocuments] = useState<TransportDocument[]>([])

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    if (isEditMode && defaultValues) {
      setPlate(defaultValues.plate || '')
      setType(defaultValues.type || 'comercial')
      setConductorId(defaultValues.conductorId || '')
      setItvDate(defaultValues.itvDate || '')
      setItvExpiry(defaultValues.itvExpiry || '')
      setLastService(defaultValues.lastService || '')
      setNextService(defaultValues.nextService || '')
      setDocuments(defaultValues.documents || [])
      return
    }

    setPlate('')
    setType('comercial')
    setConductorId('')
    setItvDate('')
    setItvExpiry('')
    setLastService('')
    setNextService('')
    setDocuments([])
  }, [defaultValues, isEditMode, isOpen])

  const availableDrivers = useMemo(() => {
    if (!personnel) return []

    return personnel.filter((person) => {
      if (!person.driver) return false
      if (type === 'camioGran' || type === 'camioGranFred') {
        return person.driver.camioGran === true
      }
      return person.driver.camioPetit === true
    })
  }, [personnel, type])

  const handleOpenFileDialog = () => {
    fileInputRef.current?.click()
  }

  const handleFilesSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files
    if (!files?.length) return

    const now = new Date().toISOString()

    for (const file of Array.from(files)) {
      const validTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/jpg',
        'image/webp',
      ]
      if (!validTypes.includes(file.type)) {
        alert(`Tipus de fitxer no permes: ${file.name}`)
        continue
      }

      let fileToUpload = file
      if (file.type.startsWith('image/')) {
        try {
          fileToUpload = await compressRasterImageForUpload(file, DEFAULT_MAX_IMAGE_UPLOAD_BYTES)
        } catch {
          alert(`No s ha pogut optimitzar la imatge ${file.name}.`)
          continue
        }
        if (fileToUpload.size > DEFAULT_MAX_IMAGE_UPLOAD_BYTES) {
          alert(`La imatge ${file.name} encara supera 1MB despres de comprimir.`)
          continue
        }
      } else if (file.size > 5 * 1024 * 1024) {
        alert(`El fitxer ${file.name} supera els 5MB.`)
        continue
      }

      try {
        const safePlate = plate || defaultValues?.plate || 'sense-matricula'
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const storageName = fileToUpload.name || file.name
        const storagePath = `transports/${safePlate}/${id}-${storageName}`
        const fileRef = ref(storage, storagePath)

        await uploadBytes(fileRef, fileToUpload)
        const url = await getDownloadURL(fileRef)

        setDocuments((prev) => [
          ...prev,
          { id, name: storageName, url, uploadedAt: now },
        ])
      } catch (err) {
        console.error('Error pujant document:', err)
        alert(`No s'ha pogut pujar el fitxer ${file.name}.`)
      }
    }

    event.target.value = ''
  }

  const handleRemoveDocument = async (doc: TransportDocument) => {
    if (!window.confirm(`Vols eliminar el document "${doc.name}"?`)) return
    setDocuments((prev) => prev.filter((item) => item.id !== doc.id))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const payload: TransportPayload = {
      plate: plate.trim(),
      type,
      conductorId: conductorId || null,
      itvDate: itvDate || null,
      itvExpiry: itvExpiry || null,
      lastService: lastService || null,
      nextService: nextService || null,
      documents: documents.map((doc) => doc.url),
    }

    try {
      if (isEditMode && defaultValues?.id) {
        const res = await fetch(`/api/transports/${defaultValues.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Error actualitzant transport')
      } else {
        await mutateAsync(payload)
      }

      onCreated()
      onOpenChange(false)
    } catch (err) {
      console.error('Error desant transport:', err)
      alert("No s'ha pogut desar el vehicle.")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" lockDismissOnOutside>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {isEditMode ? 'Editar transport' : 'Nou transport'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plate">Matricula</Label>
              <Input
                id="plate"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="Ex: 7447 MHX"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="type">Tipus de vehicle</Label>
              <select
                id="type"
                value={type}
                onChange={(e) => {
                  const value = e.target.value
                  if (isTransportType(value)) setType(value)
                }}
                className="w-full rounded-md border px-2 py-2 text-sm"
              >
                {TRANSPORT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="conductorId">Conductor (opcional)</Label>
              <select
                id="conductorId"
                value={conductorId}
                onChange={(e) => setConductorId(e.target.value)}
                className="w-full rounded-md border px-2 py-2 text-sm"
              >
                <option value="">- Sense conductor assignat -</option>
                {availableDrivers.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              ITV
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="itvDate">Data ITV</Label>
                <Input
                  id="itvDate"
                  type="date"
                  value={itvDate}
                  onChange={(e) => setItvDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="itvExpiry">Caducitat ITV</Label>
                <Input
                  id="itvExpiry"
                  type="date"
                  value={itvExpiry}
                  onChange={(e) => setItvExpiry(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Revisio
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lastService">Ultima revisio</Label>
                <Input
                  id="lastService"
                  type="date"
                  value={lastService}
                  onChange={(e) => setLastService(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nextService">Propera revisio</Label>
                <Input
                  id="nextService"
                  type="date"
                  value={nextService}
                  onChange={(e) => setNextService(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Documentacio del vehicle
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenFileDialog}
              >
                Adjuntar document
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,image/*"
                className="hidden"
                onChange={handleFilesSelected}
              />
            </div>

            {documents.length === 0 ? (
              <p className="text-xs text-slate-500">
                Encara no hi ha cap document adjunt.
              </p>
            ) : (
              <ul className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-white px-2 py-1.5"
                  >
                    <div className="flex flex-col">
                      <span className="max-w-[180px] truncate font-medium">
                        {doc.name}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(doc.uploadedAt).toLocaleDateString('ca-ES')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Obrir
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemoveDocument(doc)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading
                ? 'Desant...'
                : isEditMode
                ? 'Desar canvis'
                : 'Afegir transport'}
            </Button>
          </div>

          {error && <p className="text-sm text-red-600">{String(error)}</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}
