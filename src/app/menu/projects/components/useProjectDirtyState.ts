'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
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
  const [savedRevision, setSavedRevision] = useState(0)

  const bumpSavedRevision = useCallback(() => {
    setSavedRevision((current) => current + 1)
  }, [])

  const resetSnapshots = useCallback((source: ProjectData) => {
    savedOverviewRef.current = captureOverviewDirtySnapshot(source)
    savedBlocksRef.current = captureBlocksDirtySnapshot(source)
    bumpSavedRevision()
  }, [bumpSavedRevision])

  const dirtyOverview = useMemo(() => {
    void savedRevision
    return (
      overviewSnapshotsDiffer(captureOverviewDirtySnapshot(project), savedOverviewRef.current) ||
      Boolean(pendingFile)
    )
  }, [pendingFile, project, savedRevision])

  const dirtyBlocks = useMemo(() => {
    void savedRevision
    return blocksSnapshotsDiffer(captureBlocksDirtySnapshot(project), savedBlocksRef.current)
  }, [project, savedRevision])

  const markOverviewSaved = useCallback(
    (source: ProjectData) => {
      savedOverviewRef.current = captureOverviewDirtySnapshot(source)
      bumpSavedRevision()
    },
    [bumpSavedRevision]
  )

  const markBlocksSaved = useCallback(
    (source: ProjectData) => {
      savedBlocksRef.current = captureBlocksDirtySnapshot(source)
      bumpSavedRevision()
    },
    [bumpSavedRevision]
  )

  return {
    dirtyOverview,
    dirtyBlocks,
    markOverviewSaved,
    markBlocksSaved,
    resetSnapshots,
  }
}
