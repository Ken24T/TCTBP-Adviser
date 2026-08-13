import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { StatusVerifyResult } from '../shared/status-verify'
import { VerifyStatusPanel } from './components/VerifyStatusPanel'

const passed: StatusVerifyResult = {
  ok: true,
  exitCode: 0,
  errorCode: null,
  message: null,
  document: {
    contract: {
      name: 'TCTBP Adviser',
      major: 1,
      minor: 0,
      capabilities: ['inspection-v1'],
      schema: 'schemas/tctbp-adviser-inspection-v1.schema.json',
    },
    observation: {
      provider: 'tctbp-web',
      observedAt: '2026-08-13T00:00:00.000Z',
      fetchPerformed: false,
      repository: {
        name: 'fixture',
        tctbpSchemaVersion: 11,
        tctbpVersion: '0.3.6',
        versionSource: 'scripts/package.json',
      },
      head: { branch: 'development', detached: false, sha: 'a'.repeat(40) },
      workingTree: { clean: true, pathCount: 0 },
      operations: [],
      release: { reachableTag: 'v0.3.6', publishedTag: null },
      continuationFileCount: 0,
      statusAdvice: { tokens: ['checkpoint'], reasonCodes: [] },
      activeGuardrails: ['checkpoint-lock'],
    },
    errors: [],
  },
}

describe('VerifyStatusPanel', () => {
  it('renders the parsed runner facts on success', () => {
    const markup = renderToStaticMarkup(
      <VerifyStatusPanel result={passed} onClose={() => undefined} />,
    )

    expect(markup).toContain('TCTBP status verification')
    expect(markup).toContain('Runner passed')
    expect(markup).toContain('scripts/package.json = 0.3.6')
    expect(markup).toContain('contract v1.0')
    expect(markup).toContain('checkpoint')
    expect(markup).toContain('checkpoint-lock')
  })

  it('renders the failure message when verification cannot run', () => {
    const failed: StatusVerifyResult = {
      ok: false,
      exitCode: null,
      errorCode: 'no-tctbp-surface',
      message: 'No TCTBP status runner is installed in this repository.',
      document: null,
    }
    const markup = renderToStaticMarkup(
      <VerifyStatusPanel result={failed} onClose={() => undefined} />,
    )

    expect(markup).toContain('Could not verify')
    expect(markup).toContain('No TCTBP status runner is installed')
    expect(markup).toContain('Dismiss verification result')
  })
})
