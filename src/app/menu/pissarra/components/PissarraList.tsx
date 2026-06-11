// filename: src/app/menu/pissarra/components/PissarraList.tsx
"use client"

import { format, eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns"
import { ca } from "date-fns/locale"
import { MotionDiv } from '@/lib/lazyMotion'
import PissarraCard from "./PissarraCard"
import PissarraCardLogistica from "./PissarraCardLogistica"
import PissarraCardCuina from "./PissarraCardCuina"
import type { PissarraItem } from "@/hooks/usePissarra"

type Variant = "produccio" | "logistica" | "cuina"

type Props = {
  dataByDay: Record<string, PissarraItem[]>
  canEdit: boolean
  onUpdate: (id: string, payload: Partial<PissarraItem>) => Promise<void>
  weekStart: Date
  variant?: Variant
}

export default function PissarraList({
  dataByDay,
  canEdit,
  onUpdate,
  weekStart,
  variant = "produccio",
}: Props) {
  const start = startOfWeek(weekStart, { weekStartsOn: 1 })
  const end = endOfWeek(weekStart, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start, end })

  return (
    <div
      key={weekStart.toISOString()}
      className="relative w-full overflow-x-auto"
      data-print="root"
    >
      {/* Header */}
      <div
        className="grid grid-cols-7 min-w-[720px] sm:min-w-[900px] bg-white sticky top-0 z-20 border-b"
        data-print="header"
      >
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="text-center font-semibold text-gray-700 py-2 border-r last:border-r-0 text-sm uppercase bg-white"
          >
            <div>{format(day, "d/MM", { locale: ca })}</div>
            <div className="text-[11px] text-gray-500">{format(day, "EEE", { locale: ca })}</div>
          </div>
        ))}
      </div>

      {/* Content */}
      <div
        className="grid grid-cols-7 min-w-[720px] sm:min-w-[900px] max-h-[80vh] overflow-y-auto"
        data-print="content"
      >
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd")
          let events = dataByDay[key] || []

          // Ordena per hora d'inici (HH:mm) amb fallback al final
          events = [...events].sort((a, b) => {
            const hA = (a.startTime || "").trim()
            const hB = (b.startTime || "").trim()
            if (!hA && !hB) return 0
            if (!hA) return 1
            if (!hB) return -1
            return hA.localeCompare(hB)
          })

          return (
            <div key={key} className="flex flex-col border-r last:border-r-0 border-gray-200 p-1 bg-gray-50">
              {events.length > 0 ? (
                events.map((ev) => (
                  <MotionDiv key={ev.id} layout>
                    {variant === "logistica" ? (
                      <PissarraCardLogistica item={ev} />
                    ) : variant === "cuina" ? (
                      <PissarraCardCuina item={ev} />
                    ) : (
                      <PissarraCard item={ev} canEdit={canEdit} onUpdate={onUpdate} />
                    )}
                  </MotionDiv>
                ))
              ) : (
                <div className="text-center text-gray-400 text-xs py-6">-</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
