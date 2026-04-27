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
            <th className="px-4 py-2 text-left font-semibold">Name</th>
            <th className="px-4 py-2 text-left font-semibold">Password</th>
            <th className="px-4 py-2 text-left font-semibold">Role</th>
            <th className="px-4 py-2 text-left font-semibold">Department</th>
            <th className="px-4 py-2 text-left font-semibold">Comercial Zoho</th>
            <th className="px-4 py-2 font-semibold">Actions</th>
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
                  Edit
                </button>
                <button
                  className="text-red-600 hover:underline"
                  onClick={() => onDelete(u.id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
