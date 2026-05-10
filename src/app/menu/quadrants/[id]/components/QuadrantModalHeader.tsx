import {
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type QuadrantModalHeaderProps = {
  eventName: string
  service?: string | null
  pax?: number | null
  eventStartTime?: string
  startTime?: string
  location?: string
}

export default function QuadrantModalHeader({
  eventName,
  service,
  pax,
  eventStartTime,
  startTime,
  location,
}: QuadrantModalHeaderProps) {
  return (
    <div className="relative border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-3 py-3 sm:px-4">
      <DialogHeader className="gap-1 pr-10">
        <DialogTitle className="text-lg font-bold text-slate-900">{eventName}</DialogTitle>
        <DialogDescription className="text-slate-600">
          Servei {service || '—'} · PAX {pax ?? '—'} · Hora inici{' '}
          {eventStartTime || startTime || '—:—'}
          {location ? ` · Ubicació ${location}` : ''}
        </DialogDescription>
      </DialogHeader>

      <DialogClose className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-sm text-slate-600 shadow-sm backdrop-blur hover:bg-white hover:text-slate-900">
        ✕
      </DialogClose>
    </div>
  )
}
