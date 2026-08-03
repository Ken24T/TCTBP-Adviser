import { describe, expect, it, vi } from 'vitest'
import type { UpgradeReviewEvidence } from '../shared/ai-review'
import { createAiReviewer } from './ai-reviewer'

const evidence: UpgradeReviewEvidence = {
  evidenceVersion: 1,
  repositoryName: 'example',
  planFingerprint: 'a'.repeat(64),
  disposition: 'review-required',
  sourceAlignment: 'outdated',
  source: { repository: 'TCTBP-Web', version: '0.3.0', revision: 'a'.repeat(40) },
  target: {
    branch: 'feature/upgrade',
    headSha: 'b'.repeat(40),
    tctbpInstalled: true,
    policyAvailable: true,
    workingTreeClean: true,
    detached: false,
    sourceRepository: 'Ken24T/TCTBP-Web',
    sourceVersion: '0.2.0',
  },
  actionCounts: { preserve: 1, add: 1, review: 1, unavailable: 0 },
  files: [],
  blockers: [],
  policyDifferences: [],
  truncated: false,
}

describe('Jasper upgrade-plan reviewer', () => {
  it('stays disabled without a complete encrypted configuration', async () => {
    const reviewer = createAiReviewer({
      enabled: false,
      apiKey: null,
      baseUrl: null,
      model: null,
      timeoutMs: 1_000,
      maximumOutputTokens: 8_000,
      maximumResponseBytes: 16_384,
    })

    await expect(reviewer.reviewUpgradePlan(evidence)).resolves.toMatchObject({
      status: 'disabled',
      planFingerprint: null,
    })
  })

  it('accepts fenced JSON and preserves evidence references', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: '```json\n{"summary":"Bootstrap needs review.","risks":[{"message":"No policy","evidenceRefs":["target.policyAvailable"]}],"confidence":"low"}\n```',
        },
      }],
    }), { status: 200 }))
    const reviewer = createAiReviewer({
      enabled: true,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'jasper-test',
      timeoutMs: 1_000,
      maximumOutputTokens: 8_000,
      maximumResponseBytes: 16_384,
    }, fetcher)

    await expect(reviewer.reviewUpgradePlan(evidence)).resolves.toMatchObject({
      status: 'available',
      summary: 'Bootstrap needs review.',
      risks: [{
        message: 'No policy',
        evidenceRefs: ['target.policyAvailable'],
      }],
    })
  })

  it('reports safe provider diagnostics for HTTP errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('secret provider body', {
      status: 400,
    }))
    const reviewer = createAiReviewer({
      enabled: true,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'jasper-test',
      timeoutMs: 1_000,
      maximumOutputTokens: 8_000,
      maximumResponseBytes: 16_384,
    }, fetcher)

    await expect(reviewer.reviewUpgradePlan(evidence)).resolves.toMatchObject({
      status: 'unavailable',
      error: 'AI provider returned HTTP 400.',
    })
  })

  it('reports when the provider truncates JSON at the token limit', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: 'length',
        message: { content: '{"summary":"incomplete' },
      }],
    }), { status: 200 }))
    const reviewer = createAiReviewer({
      enabled: true,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'jasper-test',
      timeoutMs: 1_000,
      maximumOutputTokens: 8_000,
      maximumResponseBytes: 16_384,
    }, fetcher)

    await expect(reviewer.reviewUpgradePlan(evidence)).resolves.toMatchObject({
      status: 'invalid',
      error: 'AI provider response was truncated before valid JSON was completed.',
    })
  })

  it('explains when the provider returns reasoning without a final answer', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: null, reasoning_content: 'thinking' } }],
    }), { status: 200 }))
    const reviewer = createAiReviewer({
      enabled: true,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'jasper-test',
      timeoutMs: 1_000,
      maximumOutputTokens: 8_000,
      maximumResponseBytes: 16_384,
    }, fetcher)

    await expect(reviewer.reviewUpgradePlan(evidence)).resolves.toMatchObject({
      status: 'invalid',
      error: 'AI provider returned reasoning content but no final answer.',
    })
  })

  it('validates a structured provider response without calling real AI', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Review the managed file drift.',
            risks: [{
              message: 'A policy difference needs review.',
              evidenceRefs: ['plan.policyDifferences'],
            }],
            recommendedNextStep: 'Inspect the exported plan.',
            confidence: 'medium',
            unknowns: [],
          }),
        },
      }],
    }), { status: 200 }))
    const reviewer = createAiReviewer({
      enabled: true,
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'jasper-test',
      timeoutMs: 1_000,
      maximumOutputTokens: 8_000,
      maximumResponseBytes: 16_384,
    }, fetcher)

    await expect(reviewer.reviewUpgradePlan(evidence)).resolves.toMatchObject({
      status: 'available',
      summary: 'Review the managed file drift.',
      confidence: 'medium',
      planFingerprint: evidence.planFingerprint,
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
