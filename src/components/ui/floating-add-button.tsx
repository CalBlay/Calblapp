// file: src/components/ui/floating-add-button.tsx
'use client'

import { Plus } from 'lucide-react'
import { MotionButton } from '@/lib/lazyMotion'
import { cn } from '@/lib/utils'

type FloatingAddButtonProps = {
  onClick: () => void
  className?: string 
}

export default function FloatingAddButton({ onClick, className }: FloatingAddButtonProps) {
  return (
    <MotionButton
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.7, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileTap={{ scale: 0.9 }}
      className={cn(
        `
        fixed
        bottom-[max(1.25rem,env(safe-area-inset-bottom))]
        right-4
        sm:right-10
        h-14 w-14
        rounded-full
        bg-blue-600 
        text-white 
        shadow-xl 
        flex items-center justify-center
        hover:bg-blue-700 
        transition
        cursor-pointer
        z-50
        `,
        className
      )}
    >
      <Plus className="h-7 w-7" />
    </MotionButton>
  )
}
