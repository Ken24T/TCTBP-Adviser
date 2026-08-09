import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDebouncedRestart,
  SERVER_RESTART_DEBOUNCE_MS,
} from './vite-plugin'

describe('debounced server restart', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('restarts exactly once after the quiet period despite a burst of changes', () => {
    const restart = vi.fn()
    const debounce = createDebouncedRestart(restart)

    debounce.schedule()
    vi.advanceTimersByTime(50)
    debounce.schedule()
    vi.advanceTimersByTime(50)
    debounce.schedule()

    expect(debounce.pending).toBe(true)
    vi.advanceTimersByTime(SERVER_RESTART_DEBOUNCE_MS)

    expect(restart).toHaveBeenCalledTimes(1)
    expect(debounce.pending).toBe(false)
  })

  it('does not restart before the debounce window elapses', () => {
    const restart = vi.fn()
    const debounce = createDebouncedRestart(restart)

    debounce.schedule()
    vi.advanceTimersByTime(SERVER_RESTART_DEBOUNCE_MS - 1)

    expect(restart).not.toHaveBeenCalled()
  })

  it('cancel prevents a pending restart', () => {
    const restart = vi.fn()
    const debounce = createDebouncedRestart(restart)

    debounce.schedule()
    debounce.cancel()
    vi.advanceTimersByTime(SERVER_RESTART_DEBOUNCE_MS)

    expect(restart).not.toHaveBeenCalled()
  })
})
