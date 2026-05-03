// src/components/users/UserTable.tsx
import React from 'react'
import type { User } from '@/hooks/useUsers'

interface UserTableProps {
  users: User[]
  onEdit: (user: User) => void
  onDelete: (id: string) => void
}

export function UserTable({ users, onEdit, onDelete }: UserTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left font-semibold">Nom</th>
            <th className="px-4 py-2 text-left font-semibold">Contrasenya</th>
            <th className="px-4 py-2 text-left font-semibold">Rol</th>
            <th className="px-4 py-2 text-left font-semibold">Departament</th>
            <th className="px-4 py-2 text-left font-semibold">Comercial Zoho</th>
            <th className="px-4 py-2 font-semibold">Accions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {users.map((u, idx) => (
            <tr key={u.id || idx}>
              <td className="px-4 py-2">{u.name}</td>
              <td className="px-4 py-2">{u.password}</td>
              <td className="px-4 py-2">{u.role}</td>
              <td className="px-4 py-2">{u.department}</td>
              <td className="px-4 py-2">{u.commercialName || '-'}</td>
              <td className="px-4 py-2 space-x-2">
                <button
                  className="text-blue-600 hover:underline"
                  onClick={() => onEdit(u)}
                >
                  Edita
                </button>
                <button
                  className="text-red-600 hover:underline"
                  onClick={() => onDelete(u.id)}
                >
                  Suprimeix
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
