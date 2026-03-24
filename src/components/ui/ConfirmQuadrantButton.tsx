'use client'

import { Button } from './button'

export function ConfirmQuadrantButton({ department }: { department: string }) {
  return (
    <Button disabled title={`Botó legacy per al departament ${department}`}>
      Confirmar Quadrant
    </Button>
  )
}
