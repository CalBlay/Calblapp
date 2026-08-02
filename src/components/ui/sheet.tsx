// 📁 src/components/ui/sheet.tsx
'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & {
    side?: 'top' | 'bottom' | 'left' | 'right'
    overlayClassName?: string
  }
>(({ side = 'right', className, overlayClassName, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay className={overlayClassName} />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 gap-4 bg-white p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out',
        side === 'right' && 'inset-y-0 right-0 h-full w-3/4 sm:max-w-sm',
        side === 'left' && 'inset-y-0 left-0 h-full w-3/4 sm:max-w-sm',
        side === 'bottom' && 'inset-x-0 bottom-0 h-3/4',
        side === 'top' && 'inset-x-0 top-0 h-3/4',
        className
      )}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition hover:opacity-100 focus:outline-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('space-y-2 text-center sm:text-left', className)} {...props} />
)
SheetHeader.displayName = 'SheetHeader'

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-gray-900', className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle }
