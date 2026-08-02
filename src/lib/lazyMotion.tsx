'use client'

import dynamic from 'next/dynamic'
import type { ComponentType, ReactNode } from 'react'

type MotionComponentProps = Record<string, unknown>

const loadFramerMotion = () => import('framer-motion')

/** `motion.div` carregat sota demanda (evita framer-motion al bundle inicial). */
export const MotionDiv = dynamic(
  () => loadFramerMotion().then((mod) => mod.motion.div as ComponentType<MotionComponentProps>),
  { ssr: false }
)

/** `motion.button` carregat sota demanda. */
export const MotionButton = dynamic(
  () => loadFramerMotion().then((mod) => mod.motion.button as ComponentType<MotionComponentProps>),
  { ssr: false }
)

/** `motion.h1` carregat sota demanda. */
export const MotionH1 = dynamic(
  () => loadFramerMotion().then((mod) => mod.motion.h1 as ComponentType<MotionComponentProps>),
  { ssr: false }
)

/** `AnimatePresence` carregat sota demanda. */
export const LazyAnimatePresence = dynamic(
  () =>
    loadFramerMotion().then(
      (mod) => mod.AnimatePresence as ComponentType<{ children?: ReactNode } & MotionComponentProps>
    ),
  { ssr: false }
)
