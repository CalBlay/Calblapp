// src/app/menu/personnel/[id]/page.tsx
'use client'

import React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { usePersonnel } from '@/hooks/usePersonnel'
import Link from 'next/link'

export default function PersonnelDetailPage() {
  const { id } = useParams() as { id: string }
  const { data: personnel = [], isLoading, error } = usePersonnel()
  const router = useRouter()

  if (isLoading) return <p>Carregant perfil…</p>
  if (error) return <p className="text-red-600">Error: {String(error)}</p>

  const person = personnel.find(p => p.id === id)
  if (!person) {
    return (
      <div className="p-4">
        <p className="text-red-500">Perfil no trobat: {id}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-gray-200 rounded"
        >
          ← Tornar
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-4">
      <Link
        href="/menu/personnel"
        className="inline-block text-blue-600 hover:underline"
      >
        ← Tornar a la llista
      </Link>

      <div className="flex flex-col items-center space-y-4">
        <div className="h-32 w-32 rounded-full bg-gray-200 flex items-center justify-center text-4xl">
          {person.id.charAt(0)}
        </div>

        <h1 className="text-2xl font-bold">{person.id}</h1>
        <p><strong>Rol:</strong> {person.role}</p>
        <p><strong>Departament:</strong> {person.department}</p>
        <p>
          <strong>Disponible:</strong>{' '}
          {person.available ? 'Sí' : 'No'}
        </p>
        <p>
          <strong>Email:</strong>{' '}
          <a
            href={`mailto:${person.email}`}
            className="text-blue-600 hover:underline"
          >
            {person.email}
          </a>
        </p>
        {person.phone && (
          <p>
            <strong>Telèfon:</strong>{' '}
            <a
              href={`tel:${person.phone}`}
              className="text-blue-600 hover:underline"
            >
              {person.phone}
            </a>
          </p>
        )}
      </div>
    </div>
  )
}
