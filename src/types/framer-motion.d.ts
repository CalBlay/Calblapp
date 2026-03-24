declare module 'framer-motion' {
  import * as React from 'react'

  export const motion: Record<string, React.ComponentType<Record<string, unknown>>>
  export const AnimatePresence: React.ComponentType<Record<string, unknown>>
}
