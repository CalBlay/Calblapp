import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { QuadrantMode } from './quadrantModalTypes'

type QuadrantModeSelectorProps = {
  mode: QuadrantMode
  onModeChange: (mode: QuadrantMode) => void
}

export default function QuadrantModeSelector({
  mode,
  onModeChange,
}: QuadrantModeSelectorProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-[220px_1fr] md:items-end">
        <div>
          <Label>Mode</Label>
          <div className="grid grid-cols-3 gap-2 max-w-[520px]">
            <Button
              type="button"
              variant={mode === 'auto' ? 'default' : 'secondary'}
              className="h-9 rounded-full px-4 w-full justify-center whitespace-nowrap"
              onClick={() => onModeChange('auto')}
            >
              Auto
            </Button>
            <Button
              type="button"
              variant={mode === 'semi' ? 'default' : 'secondary'}
              className="h-9 rounded-full px-4 w-full justify-center whitespace-nowrap"
              onClick={() => onModeChange('semi')}
            >
              Semi-auto
            </Button>
            <Button
              type="button"
              variant={mode === 'manual' ? 'default' : 'secondary'}
              className="h-9 rounded-full px-4 w-full justify-center whitespace-nowrap"
              onClick={() => onModeChange('manual')}
            >
              Manual
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
