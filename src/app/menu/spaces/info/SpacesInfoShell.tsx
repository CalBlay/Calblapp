'use client'

import SpacesSectionGate from '../SpacesSectionGate'
import { SPACES_BBDD_PATH } from '@/lib/spacesPermissions'
import SpacesInfoClient from './SpacesInfoClient'

type Espai = {
  id: string
  code?: string
  nom: string
  ln?: string
  tipus?: string
  comercial?: Record<string, unknown>
  produccio?: Record<string, unknown>
}

type Props = {
  espais: Espai[]
  lnOptions: string[]
}

export default function SpacesInfoShell(props: Props) {
  return (
    <SpacesSectionGate subpath={SPACES_BBDD_PATH}>
      <SpacesInfoClient {...props} />
    </SpacesSectionGate>
  )
}
