import {
  BriefcaseBusiness,
  ChefHat,
  ConciergeBell,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  OPERATIONAL_AREA_LABELS,
  type OperationalArea,
} from '@/lib/operationalAreas'

const OPERATIONAL_AREA_ICONS: Record<OperationalArea, LucideIcon> = {
  commercial: BriefcaseBusiness,
  cuina: ChefHat,
  serveis: ConciergeBell,
  logistica: Truck,
}

export default function OperationalAreaIcon({
  area,
  className,
}: {
  area: OperationalArea
  className?: string
}) {
  const Icon = OPERATIONAL_AREA_ICONS[area]
  const label = OPERATIONAL_AREA_LABELS[area]

  return (
    <span
      className={cn('inline-flex shrink-0', className)}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  )
}
