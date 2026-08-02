import { randomUUID } from 'node:crypto'
import type {
  AiReviewResult,
  AiReviewRisk,
  UpgradeEvidenceReference,
  UpgradeReviewEvidence,
} from '../shared/ai-review'
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
      return unavailableResult(
        'disabled',
        reviewId,
        reviewedAt,
        this.settings.model,
      )
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
        return unavailableResult(
          'unavailable',
          reviewId,
          reviewedAt,
          this.settings.model,
          `AI provider returned HTTP ${response.status}.`,
        )
      }
      if (Buffer.byteLength(text, 'utf8') > this.settings.maximumResponseBytes) {
        return unavailableResult(
          'invalid',
          reviewId,
          reviewedAt,
          this.settings.model,
          'AI response exceeded the configured size limit.',
        )
      }
      const parsed = parseProviderResponse(text)
      if (!parsed.value) {
        return unavailableResult(
          'invalid',
          reviewId,
          reviewedAt,
          this.settings.model,
          parsed.error,
        )
      }
      return {
        status: 'available',
        reviewId,
        reviewedAt,
        provider: 'openai-compatible',
        model: this.settings.model,
        planFingerprint: evidence.planFingerprint,
        ...parsed.value,
        error: null,
      }
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'AbortError'
      return unavailableResult(
        'unavailable',
        reviewId,
        reviewedAt,
        this.settings.model,
        timedOut ? 'AI provider request timed out.' : 'AI provider could not be reached.',
      )
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
  'Each risk must be an object with message and evidenceRefs from the supplied evidence.',
  'Do not make claims without evidenceRefs; put unresolved questions in unknowns.',
  'confidence must be low, medium, high, or unknown.',
].join(' ')

type ParsedReview = {
  summary: string
  risks: AiReviewRisk[]
  recommendedNextStep: string
  confidence: 'low' | 'medium' | 'high' | 'unknown'
  unknowns: string[]
}

function parseProviderResponse(text: string): {
  value: ParsedReview | null
  error: string
} {
  let envelope: unknown
  try {
    envelope = JSON.parse(text)
  } catch {
    return { value: null, error: 'AI provider returned an invalid JSON envelope.' }
  }

  let content: string
  try {
    content = extractContent(envelope)
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error
        ? error.message
        : 'AI provider returned no final message content.',
    }
  }

  let value: unknown
  try {
    value = JSON.parse(stripJsonFences(content))
  } catch {
    return { value: null, error: 'AI provider final content was not valid JSON.' }
  }
  if (!isObject(value) || typeof value.summary !== 'string') {
    return { value: null, error: 'AI provider JSON did not include a summary.' }
  }
  const confidence = ['low', 'medium', 'high', 'unknown'].includes(String(value.confidence))
    ? value.confidence as 'low' | 'medium' | 'high' | 'unknown'
    : 'unknown'
  return {
    value: {
      summary: value.summary.slice(0, 4_000),
      risks: parseRisks(value.risks),
      recommendedNextStep: typeof value.recommendedNextStep === 'string'
        ? value.recommendedNextStep.slice(0, 1_000)
        : 'Review the deterministic plan before taking action.',
      confidence,
      unknowns: stringList(value.unknowns, 5, 500),
    },
    error: '',
  }
}

function extractContent(envelope: unknown): string {
  if (!isObject(envelope)) throw new Error('AI response is not an object.')
  const choices = Array.isArray(envelope.choices) ? envelope.choices : []
  const first = isObject(choices[0]) ? choices[0] : null
  const message = first && isObject(first.message) ? first.message : null
  if (!message) throw new Error('AI response has no message.')
  if (typeof message.content === 'string' && message.content.trim().length > 0) {
    return message.content
  }
  if (isObject(message.content)) return JSON.stringify(message.content)
  if (Array.isArray(message.content)) {
    const content = message.content
      .filter((part) => isObject(part) && typeof part.text === 'string')
      .map((part) => (part as { text: string }).text)
      .join('')
    if (content.trim().length > 0) return content
  }
  if (typeof message.reasoning_content === 'string') {
    throw new Error('AI provider returned reasoning content but no final answer.')
  }
  throw new Error('AI provider returned no final message content.')
}

function stripJsonFences(content: string): string {
  const trimmed = content.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  if (fenced) return fenced[1]
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  return firstBrace >= 0 && lastBrace > firstBrace
    ? trimmed.slice(firstBrace, lastBrace + 1)
    : trimmed
}

function parseRisks(value: unknown): AiReviewRisk[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 5).flatMap((item) => {
    if (typeof item === 'string') {
      return [{ message: item.slice(0, 500), evidenceRefs: [] }]
    }
    if (!isObject(item) || typeof item.message !== 'string') return []
    return [{
      message: item.message.slice(0, 500),
      evidenceRefs: evidenceReferences(item.evidenceRefs),
    }]
  })
}

function evidenceReferences(value: unknown): UpgradeEvidenceReference[] {
  const allowed: UpgradeEvidenceReference[] = [
    'plan.disposition',
    'plan.sourceAlignment',
    'target.tctbpInstalled',
    'target.policyAvailable',
    'target.branch',
    'target.workingTreeClean',
    'target.detached',
    'plan.fileActions',
    'plan.blockers',
    'plan.policyDifferences',
  ]
  return Array.isArray(value)
    ? value.filter((item): item is UpgradeEvidenceReference => (
      typeof item === 'string' && allowed.includes(item as UpgradeEvidenceReference)
    ))
    : []
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
  error = status === 'disabled'
    ? 'AI review is not configured.'
    : 'AI review was unavailable.',
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
    error,
  }
}
