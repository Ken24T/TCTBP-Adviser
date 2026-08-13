import { useEffect, useRef, useState } from 'react'
import type {
  UpgradeBatchRun,
  UpgradeBatchStageId,
} from '../shared/upgrade-batch'
import { loadUpgradeBatch, startUpgradeBatch } from './api'

export interface UpgradeBatchStageSeed {
  id: UpgradeBatchStageId
  label: string
}

export interface UpgradeBatch {
  run: UpgradeBatchRun | null
  busy: boolean
  error: string | null
  start: (
    aiReviewId: string,
    planFingerprint: string,
    stages: UpgradeBatchStageSeed[],
  ) => Promise<void>
  clear: () => void
}

const STAGE_ORDER: UpgradeBatchStageId[] = [
  'apply',
  'checkpoint',
  'publish',
  'merge',
  'cleanup',
]

/**
 * Owns the "run the whole upgrade journey" batch: confirms the ordered stage
 * list once, starts the server-side run, and polls it stage by stage. The run
 * is server-journaled, so a reload loses nothing — the journey re-derives from
 * the real repository state and the batch simply continues from there.
 */
export function useUpgradeBatch(
  selectedId: string | null,
  reportError: (cause: unknown) => void,
  onSettled?: (status: 'completed' | 'failed') => void,
): UpgradeBatch {
  const [run, setRun] = useState<UpgradeBatchRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current)
  }, [])

  function stopPolling(): void {
    if (pollRef.current) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  async function start(
    aiReviewId: string,
    planFingerprint: string,
    stages: UpgradeBatchStageSeed[],
  ): Promise<void> {
    if (!selectedId || stages.length === 0) return
    const list = stages.map((stage) => `• ${stage.label}`).join('\n')
    const confirmed = window.confirm(
      `Run the remaining upgrade steps in order?\n\n${list}\n\nThe batch stops at the first failure — you can then continue manually.`,
    )
    if (!confirmed) return
    setError(null)
    try {
      const started = await startUpgradeBatch(selectedId, {
        confirm: true,
        aiReviewId,
        aiReviewAcknowledged: true,
        planFingerprint,
      })
      const timestamp = new Date().toISOString()
      setRun({
        runId: started.runId,
        repositoryId: selectedId,
        status: 'queued',
        stages: STAGE_ORDER.map((id, index) => ({
          id,
          label: stages[index]?.label ?? id,
          status: 'pending' as const,
          detail: null,
          updatedAt: null,
        })),
        error: null,
        startedAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
      })
      stopPolling()
      pollRef.current = window.setInterval(() => {
        void loadUpgradeBatch(selectedId, started.runId)
          .then((next) => {
            setRun(next)
            if (next.status === 'completed' || next.status === 'failed') {
              stopPolling()
              if (next.status === 'failed') setError(next.error)
              onSettled?.(next.status)
            }
          })
          .catch((cause) => {
            stopPolling()
            reportError(cause)
          })
      }, 600)
    } catch (cause) {
      reportError(cause)
    }
  }

  function clear(): void {
    stopPolling()
    setRun(null)
    setError(null)
  }

  return {
    run,
    busy: run !== null && (run.status === 'queued' || run.status === 'running'),
    error,
    start,
    clear,
  }
}
