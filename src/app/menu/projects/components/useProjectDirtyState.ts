'use client'

import { useCallback, useMemo, useRef } from 'react'
import type { ProjectData } from './project-shared'
import {
  blocksSnapshotsDiffer,
  captureBlocksDirtySnapshot,
  captureOverviewDirtySnapshot,
  overviewSnapshotsDiffer,
  type BlocksDirtySnapshot,
  type OverviewDirtySnapshot,
} from './project-dirty-snapshots'

type Params = {
  project: ProjectData
  pendingFile: File | null
}

export function useProjectDirtyState({ project, pendingFile }: Params) {
  const savedOverviewRef = useRef<OverviewDirtySnapshot>(captureOverviewDirtySnapshot(project))
  const savedBlocksRef = useRef<BlocksDirtySnapshot>(captureBlocksDirtySnapshot(project))

  const resetSnapshots = useCallback((source: ProjectData) => {
    savedOverviewRef.current = captureOverviewDirtySnapshot(source)
    savedBlocksRef.current = captureBlocksDirtySnapshot(source)
  }, [])

  const dirtyOverview = useMemo(
    () =>
      overviewSnapshotsDiffer(captureOverviewDirtySnapshot(project), savedOverviewRef.current) ||
      Boolean(pendingFile),
    [pendingFile, project]
  )

  const dirtyBlocks = useMemo(
    () => blocksSnapshotsDiffer(captureBlocksDirtySnapshot(project), savedBlocksRef.current),
    [project]
  )

  const markOverviewSaved = useCallback((source: ProjectData) => {
    savedOverviewRef.current = captureOverviewDirtySnapshot(source)
  }, [])

  const markBlocksSaved = useCallback((source: ProjectData) => {
    savedBlocksRef.current = captureBlocksDirtySnapshot(source)
  }, [])

  return {
    dirtyOverview,
    dirtyBlocks,
    markOverviewSaved,
    markBlocksSaved,
    resetSnapshots,
  }
}
