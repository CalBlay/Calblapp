// file: src/components/spaces/FincaModal.tsx
'use client'

import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { Loader2, MapPin, Info, XCircle, X } from 'lucide-react'

import { db } from '@/lib/firebaseClient'
import { doc, getDoc } from 'firebase/firestore'

interface Props {
  fincaId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FincaData {
  id: string
  nom?: string
  ubicacio?: string
  contacte?: string
  telefon?: string
  email?: string
  observacionsComercials?: string
  observacionsProduccio?: string
}

type FincaFirestoreDoc = Omit<FincaData, 'id'> & Record<string, unknown>

export default function FincaModal({ fincaId, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(true)
  const [finca, setFinca] = useState<FincaData | null>(null)

  useEffect(() => {
    if (!fincaId || !open) return

    const fetchFinca = async () => {
      try {
        setLoading(true)
        const ref = doc(db, 'finques', fincaId)
        const snap = await getDoc(ref)

        if (snap.exists()) setFinca({ id: snap.id, ...(snap.data() as FincaFirestoreDoc) })
      } catch (err) {
        console.error('❌ Error carregant finca:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchFinca()
  }, [fincaId, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
     <DialogContent className="max-w-xl rounded-2xl shadow-xl border bg-white [&>button]:hidden">


        {/* BOTÓ TANCAR */}
        <DialogClose asChild>
          <button
            className="absolute right-4 top-4 rounded-md p-1 text-gray-500 hover:bg-gray-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </DialogClose>

        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-700" />
            Informació de la Finca
          </DialogTitle>
          <DialogDescription>
            Dades comercials i operatives de la finca seleccionada.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin w-6 h-6 text-gray-500" />
          </div>
        ) : !finca ? (
          <div className="text-center py-6 text-red-600 flex flex-col items-center gap-2">
            <XCircle className="w-6 h-6" />
            No s’ha trobat informació d’aquesta finca.
          </div>
        ) : (
          <div className="flex flex-col gap-4 text-sm">

            <div>
              <h3 className="font-semibold">Nom</h3>
              <p className="text-gray-600">{finca.nom || '—'}</p>
            </div>

            <div>
              <h3 className="font-semibold">Ubicació</h3>
              <p className="text-gray-600">{finca.ubicacio || '—'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold">Contacte</h3>
                <p className="text-gray-600">{finca.contacte || '—'}</p>
              </div>

              <div>
                <h3 className="font-semibold">Telèfon</h3>
                <p className="text-gray-600">{finca.telefon || '—'}</p>
              </div>

              <div>
                <h3 className="font-semibold">Email</h3>
                <p className="text-gray-600">{finca.email || '—'}</p>
              </div>
            </div>

            {finca.observacionsComercials && (
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Info className="w-4 h-4 text-green-600" />
                  Observacions comercials
                </h3>
                <p className="text-gray-600 whitespace-pre-line">
                  {finca.observacionsComercials}
                </p>
              </div>
            )}

            {finca.observacionsProduccio && (
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Info className="w-4 h-4 text-orange-600" />
                  Observacions de producció
                </h3>
                <p className="text-gray-600 whitespace-pre-line">
                  {finca.observacionsProduccio}
                </p>
              </div>
            )}

          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
