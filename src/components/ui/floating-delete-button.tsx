'use client'

import { Trash } from 'lucide-react'
import { MotionButton } from '@/lib/lazyMotion'
import { cn } from '@/lib/utils'

export default function FloatingDeleteButton({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) {
  return (
    <MotionButton
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className={cn(
        `
        fixed 
        bottom-6 right-[160px]    /* Just a l’esquerra del de guardar */
        h-14 w-14 
        rounded-full 
        bg-red-600 
        text-white 
        shadow-xl 
        flex items-center justify-center
        hover:bg-red-700
        transition
        z-50
        `,
        className
      )}
    >
      <Trash className="h-7 w-7" />
    </MotionButton>
  )
}
