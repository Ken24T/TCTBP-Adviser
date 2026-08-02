import { randomUUID } from 'node:crypto'
import type { AiReviewResult, UpgradeReviewEvidence } from '../shared/ai-review'
import type { AiSettings } from './ai-settings'

export interface AiReviewer {
  reviewUpgradePlan(evidence: UpgradeReviewEvidence): Promise<AiReviewResult>
}

export function createAiReviewer(
  settings: AiSettings,
  fetcher: typeof fetch = fetch,
): AiReviewer {
  return new OpenAiCompatibleReviewer(settings, fetcher)
}

class OpenAiCompatibleReviewer implements AiReviewer {
  constructor(
    readonly settings: AiSettings,
    readonly fetcher: typeof fetch,
    readonly now: () => Date = () => new Date(),
    readonly createId: () => string = randomUUID,
  ) {}

  async reviewUpgradePlan(evidence: UpgradeReviewEvidence): Promise<AiReviewResult> {
    const reviewedAt = this.now().toISOString()
    const reviewId = this.createId()
    if (
      !this.settings.enabled
      || !this.settings.apiKey
      || !this.settings.baseUrl
      || !this.settings.model
    ) {
      return unavailableResult('disabled', reviewId, reviewedAt, this.settings.model)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.settings.timeoutMs)
    try {
      const response = await this.fetcher(`${this.settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: this.settings.model,
          temperature: 0.1,
          max_tokens: 1_500,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: REVIEW_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(evidence) },
          ],
        }),
        signal: controller.signal,
      })
      const text = await response.text()
      if (!response.ok) {
        return unavailableResult('unavailable', reviewId, reviewedAt, this.settings.model)
      }
      if (Buffer.byteLength(text, 'utf8') > this.settings.maximumResponseBytes) {
        return unavailableResult('invalid', reviewId, reviewedAt, this.settings.model)
      }
      const parsed = parseProviderResponse(text)
      if (!parsed) {
        return unavailableResult('invalid', reviewId, reviewedAt, this.settings.model)
      }
      return {
        status: 'available',
        reviewId,
        reviewedAt,
        provider: 'openai-compatible',
        model: this.settings.model,
        planFingerprint: evidence.planFingerprint,
        ...parsed,
        error: null,
      }
    } catch {
      return unavailableResult('unavailable', reviewId, reviewedAt, this.settings.model)
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

const REVIEW_SYSTEM_PROMPT = [
  'You are Jasper, an advisory reviewer for deterministic TCTBP upgrade plans.',
  'Do not invent policy details. Treat the supplied evidence as authoritative.',
  'Do not approve or execute changes. Explain risks and recommend the next human step.',
  'Return JSON with summary, risks, recommendedNextStep, confidence, and unknowns.',
  'confidence must be low, medium, high, or unknown.',
].join(' ')

function parseProviderResponse(text: string): {
  summary: string
  risks: string[]
  recommendedNextStep: string
  confidence: 'low' | 'medium' | 'high' | 'unknown'
  unknowns: string[]
} | null {
  try {
    const envelope: unknown = JSON.parse(text)
    const content = extractContent(envelope)
    const value: unknown = JSON.parse(content)
    if (!isObject(value) || typeof value.summary !== 'string') return null
    const confidence = value.confidence
    if (!['low', 'medium', 'high', 'unknown'].includes(String(confidence))) return null
    return {
      summary: value.summary.slice(0, 4_000),
      risks: stringList(value.risks, 5, 500),
      recommendedNextStep: typeof value.recommendedNextStep === 'string'
        ? value.recommendedNextStep.slice(0, 1_000)
        : 'Review the deterministic plan before taking action.',
      confidence: confidence as 'low' | 'medium' | 'high' | 'unknown',
      unknowns: stringList(value.unknowns, 5, 500),
    }
  } catch {
    return null
  }
}

function extractContent(envelope: unknown): string {
  if (!isObject(envelope)) throw new Error('AI response is not an object.')
  const choices = Array.isArray(envelope.choices) ? envelope.choices : []
  const first = isObject(choices[0]) ? choices[0] : null
  const message = first && isObject(first.message) ? first.message : null
  if (!message || typeof message.content !== 'string') {
    throw new Error('AI response has no message content.')
  }
  return message.content
}

function stringList(value: unknown, maximum: number, length: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
      .slice(0, maximum)
      .map((item) => item.slice(0, length))
    : []
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unavailableResult(
  status: 'disabled' | 'unavailable' | 'invalid',
  reviewId: string,
  reviewedAt: string,
  model: string | null,
): AiReviewResult {
  return {
    status,
    reviewId,
    reviewedAt,
    provider: 'openai-compatible',
    model,
    planFingerprint: null,
    summary: null,
    risks: [],
    recommendedNextStep: null,
    confidence: 'unknown',
    unknowns: [],
    error: status === 'disabled' ? 'AI review is not configured.' : 'AI review was unavailable.',
  }
}
