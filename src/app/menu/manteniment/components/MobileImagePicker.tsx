'use client'

import Image from 'next/image'
import { ImagePlus, Camera } from 'lucide-react'

type Props = {
  label: string
  hint?: string
  count: number
  maxImages: number
  previews: string[]
  error?: string | null
  disabled?: boolean
  onFilesSelected: (files: FileList | null) => void | Promise<void>
  onRemove: (index: number) => void
}

export default function MobileImagePicker({
  label,
  hint,
  count,
  maxImages,
  previews,
  error,
  disabled = false,
  onFilesSelected,
  onRemove,
}: Props) {
  const atLimit = count >= maxImages

  const handleChange = (files: FileList | null) => {
    void onFilesSelected(files)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-gray-700">{label}</div>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {count}/{maxImages}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <label
          className={`flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition ${
            atLimit || disabled ? 'pointer-events-none opacity-50' : 'hover:border-emerald-400 hover:bg-emerald-50'
          }`}
        >
          <Camera className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          Fer foto
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={atLimit || disabled}
            onChange={(e) => {
              handleChange(e.target.files)
              e.currentTarget.value = ''
            }}
          />
        </label>

        <label
          className={`flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition ${
            atLimit || disabled ? 'pointer-events-none opacity-50' : 'hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <ImagePlus className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
          Galeria
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={atLimit || disabled}
            onChange={(e) => {
              handleChange(e.target.files)
              e.currentTarget.value = ''
            }}
          />
        </label>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {previews.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {previews.map((preview, index) => (
            <div key={`${preview}-${index}`} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <Image
                src={preview}
                alt={`Foto ${index + 1}`}
                width={640}
                height={360}
                className="aspect-[4/3] w-full object-cover"
                unoptimized
              />
              <button
                type="button"
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shadow"
                onClick={() => onRemove(index)}
                aria-label={`Eliminar foto ${index + 1}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
