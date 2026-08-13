import { useState } from 'react'
import type { ActionerJob } from '../../shared/actioner'
import type { AiReviewResult } from '../../shared/ai-review'
import type {
  TctbpBootstrapJob,
  TctbpBootstrapPlan,
  TctbpBootstrapRequest,
} from '../../shared/tctbp-bootstrap'
import type { RecommendationIntent } from '../../shared/recommendation'
import type { RepositoryDetailResult } from '../../shared/repository-detail'
import type { PortfolioPreferences } from '../../shared/portfolio-preferences'
import type { TctbpUpgradePlan } from '../../shared/tctbp-upgrade'
import type { StatusVerifyResult } from '../../shared/status-verify'
import { Button, Section, Select } from './primitives'
import { CollapsiblePanel } from './CollapsiblePanel'
import { cardSurfaceVars, severityTone } from '../card-surface'
import { useTheme } from '../theme'
import { verifyRepositoryStatus } from '../api'
import { RepositoryDetailHero } from './RepositoryDetailHero'
import { ActionerProgress } from './ActionerProgress'
import { RepositoryState } from './RepositoryState'
import { TctbpPanel } from './TctbpPanel'
import { GitHubPanel } from './GitHubPanel'
import { IntentPlanPanel } from './IntentPlanPanel'
import { INTENT_OPTIONS } from '../intent-options'
import { TctbpUpgradePanel } from './TctbpUpgradePanel'
import { NextActionBar } from './NextActionBar'
import { UpgradeBatchProgress } from './UpgradeBatchProgress'
import { VerifyStatusPanel } from './VerifyStatusPanel'
import { resolveUpgradeJourney } from '../upgrade-journey'

interface RepositoryDetailProps {
  detail: RepositoryDetailResult
  preferences?: PortfolioPreferences
  actionJob: ActionerJob | null
  actionBusy: boolean
  actionFeedback: string | null
  onRunAction: (workflowId: import('../../shared/actioner').ActionerWorkflowId) => void
  onAddOrigin: (url: string) => void
  onCreateOrigin: (name: string, visibility: 'private' | 'public') => void
  onRepairCompatibility: () => void
  intent: RecommendationIntent
  busy: boolean
  upgradePlan: TctbpUpgradePlan | null
  upgradeBusy: boolean
  applyBusy: boolean
  upgradeFeedback: string | null
  aiReview: AiReviewResult | null
  aiBusy: boolean
  aiAcknowledged: boolean
  onAiAcknowledgedChange: (value: boolean) => void
  bootstrapPlan: TctbpBootstrapPlan | null
  bootstrapBusy: boolean
  bootstrapApplyBusy: boolean
  bootstrapApplyFeedback: string | null
  bootstrapJob: TctbpBootstrapJob | null
  onPrepareBootstrap: (request: TctbpBootstrapRequest) => void
  onApplyBootstrap: (request: TctbpBootstrapRequest) => void
  onBack?: () => void
  onIntentChange: (intent: RecommendationIntent) => void
  onRefresh: () => void
  onRunRecommended: () => void
  onLoadUpgradePlan: () => void
  onReviewAi: () => void
  onApplyAdditions: () => void
  onApplyPolicy: () => void
  onApplyDrifted: () => void
  onApplyAlignment: () => void
  onDeleteObsolete: () => void
  onApplyInOrder: () => void
  onCleanupUpgradeBranch: () => void
  onMergeUpgradeBranch: () => void
  batchRun: import('../../shared/upgrade-batch').UpgradeBatchRun | null
  batchBusy: boolean
  onRunBatch: () => void
  batch?: import('../upgrade-batch').BatchableJourney | null
}

export function RepositoryDetail({
  detail,
  preferences = {},
  actionJob,
  actionBusy,
  actionFeedback,
  onRunAction,
  onAddOrigin,
  onCreateOrigin,
  onRepairCompatibility,
  intent,
  busy,
  upgradePlan,
  upgradeBusy,
  applyBusy,
  upgradeFeedback,
  aiReview,
  aiBusy,
  aiAcknowledged,
  onAiAcknowledgedChange,
  bootstrapPlan,
  bootstrapBusy,
  bootstrapApplyBusy,
  bootstrapApplyFeedback,
  bootstrapJob,
  onPrepareBootstrap,
  onApplyBootstrap,
  onBack,
  onIntentChange,
  onRefresh,
  onRunRecommended,
  onLoadUpgradePlan,
  onReviewAi,
  onApplyAdditions,
  onApplyPolicy,
  onApplyDrifted,
  onApplyAlignment,
  onDeleteObsolete,
  onApplyInOrder,
  onCleanupUpgradeBranch,
  onMergeUpgradeBranch,
  batchRun,
  batchBusy,
  onRunBatch,
  batch = null,
}: RepositoryDetailProps) {
  const [originUrl, setOriginUrl] = useState('')
  const [originInputOpen, setOriginInputOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createVisibility, setCreateVisibility] = useState<'private' | 'public'>('private')
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyResult, setVerifyResult] = useState<StatusVerifyResult | null>(null)
  const { observation, recommendation } = detail
  const description = observation.tctbp.projectDescription
    ?? 'No project description is available in the TCTBP profile.'
  // The current upgrade-journey stage, shared with the sticky action bar so
  // the upgrade planner below stands down while the bar drives the step.
  const journeyStage = resolveUpgradeJourney({
    plan: upgradePlan,
    aiReview,
    aiAcknowledged,
    primaryAction: recommendation.primaryAction,
    branchModel: observation.tctbp.branchModel,
  })?.current.id ?? null
  // The upgrade planner is only relevant once a plan has been loaded or a
  // journey is underway; otherwise it is hidden entirely.
  const showUpgradePlanner = upgradePlan !== null || journeyStage !== null
  // Known limits only surface when there is something to report; the fetch
  // caveat travels with them so it never appears on an otherwise-clean page.
  const hasUncertainties =
    recommendation.uncertainties.length > 0 ||
    observation.tctbp.scaffold.uncertainties.length > 0
  // Whether the remaining journey can be offered as a single batch run is
  // computed once in App and passed down; it drives the bar's "Run all" button.
  // The header mirrors the portfolio card's display name: custom rename when
  // set, otherwise the repository's display name (TCTBP project name), with
  // the on-disk directory name only as a last resort — never the raw path
  // slug when a friendly name exists.
  const headerName = preferences[observation.repository.id]?.name?.trim()
    || observation.repository.name
    || detail.directoryName

  const { resolved } = useTheme()
  const surface = cardSurfaceVars(
    severityTone(recommendation.severity),
    resolved === 'dark',
  )

  async function runVerify(): Promise<void> {
    setVerifyBusy(true)
    try {
      setVerifyResult(await verifyRepositoryStatus(observation.repository.id))
    } finally {
      setVerifyBusy(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in ad-detail-themed" style={surface}>
      <RepositoryDetailHero
        busy={busy}
        description={description}
        name={headerName}
        onBack={onBack}
        onRefresh={onRefresh}
        severity={recommendation.severity}
      />

      {verifyResult && (
        <VerifyStatusPanel
          onClose={() => setVerifyResult(null)}
          result={verifyResult}
        />
      )}

      <Section eyebrow="Take action">
        <NextActionBar
          plan={upgradePlan}
          aiReview={aiReview}
          aiAcknowledged={aiAcknowledged}
          primaryAction={recommendation.primaryAction}
          recommendation={recommendation}
          branchModel={observation.tctbp.branchModel}
          onAiAcknowledgedChange={onAiAcknowledgedChange}
          busy={upgradeBusy || busy}
          aiBusy={aiBusy}
          applyBusy={applyBusy}
          actionBusy={actionBusy}
          onLoad={onLoadUpgradePlan}
          onReviewAi={onReviewAi}
          onApplyInOrder={onApplyInOrder}
          onRunRecommended={onRunRecommended}
          onCleanupUpgradeBranch={onCleanupUpgradeBranch}
          onMergeUpgradeBranch={onMergeUpgradeBranch}
          onRefresh={onRefresh}
          batch={batch}
          batchBusy={batchBusy}
          onRunBatch={onRunBatch}
        />

        {batchRun && batchRun.repositoryId === observation.repository.id && (
          <UpgradeBatchProgress run={batchRun} />
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-3 text-sm text-text-secondary">
            <span className="shrink-0 font-medium">Selected outcome</span>
            <Select
              disabled={busy}
              value={intent}
              onChange={(event) => {
                const next = event.currentTarget.value
                // The "verify" entry is an action, not an intent: run it and
                // leave the selected outcome untouched (the controlled value
                // snaps back to the current intent).
                if (next === 'verify-status') {
                  void runVerify()
                  return
                }
                onIntentChange(next as RecommendationIntent)
              }}
            >
              {INTENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <optgroup label="Actions">
                <option
                  disabled={verifyBusy}
                  value="verify-status"
                >
                  Verify with status
                </option>
              </optgroup>
            </Select>
          </label>
          <p className="text-xs text-text-muted">
            {recommendation.trigger
              ? <>Suggested TCTBP trigger: <code className="px-1.5 py-0.5 bg-surface-inset rounded text-text-primary">{recommendation.trigger}</code></>
              : 'No primary trigger suggested.'}
          </p>
        </div>

        {!observation.remoteOrigin && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-surface-soft border border-border rounded-lg text-sm">
            <span className="text-text-secondary">
              No git remote &apos;origin&apos; is configured — add one to enable
              publish and promotion workflows.
            </span>
            {createOpen ? (
              <div className="flex flex-1 min-w-64 items-center gap-2">
                <input
                  aria-label="Repository name"
                  autoFocus
                  className="flex-1 px-3 py-1.5 text-sm text-text-primary bg-surface-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint font-mono"
                  onChange={(event) => setCreateName(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && createName.trim()) {
                      onCreateOrigin(createName.trim(), createVisibility)
                      setCreateOpen(false)
                      setCreateName('')
                    }
                    if (event.key === 'Escape') {
                      setCreateOpen(false)
                      setCreateName('')
                    }
                  }}
                  placeholder="repository-name"
                  value={createName}
                />
                <select
                  aria-label="Repository visibility"
                  className="px-2 py-1.5 text-sm text-text-primary bg-surface-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  onChange={(event) => (
                    setCreateVisibility(
                      event.currentTarget.value as 'private' | 'public',
                    )
                  )}
                  value={createVisibility}
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
                <Button
                  disabled={busy || actionBusy || !createName.trim()}
                  onClick={() => {
                    onCreateOrigin(createName.trim(), createVisibility)
                    setCreateOpen(false)
                    setCreateName('')
                  }}
                  size="sm"
                >
                  Create
                </Button>
                <Button
                  disabled={busy || actionBusy}
                  onClick={() => {
                    setCreateOpen(false)
                    setCreateName('')
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Cancel
                </Button>
              </div>
            ) : originInputOpen ? (
              <div className="flex flex-1 min-w-64 items-center gap-2">
                <input
                  aria-label="Origin URL"
                  autoFocus
                  className="flex-1 px-3 py-1.5 text-sm text-text-primary bg-surface-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint font-mono"
                  onChange={(event) => setOriginUrl(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && originUrl.trim()) {
                      onAddOrigin(originUrl.trim())
                      setOriginInputOpen(false)
                      setOriginUrl('')
                    }
                    if (event.key === 'Escape') {
                      setOriginInputOpen(false)
                      setOriginUrl('')
                    }
                  }}
                  placeholder="https://github.com/owner/repo.git"
                  value={originUrl}
                />
                <Button
                  disabled={busy || actionBusy || !originUrl.trim()}
                  onClick={() => {
                    onAddOrigin(originUrl.trim())
                    setOriginInputOpen(false)
                    setOriginUrl('')
                  }}
                  size="sm"
                >
                  Add
                </Button>
                <Button
                  disabled={busy || actionBusy}
                  onClick={() => {
                    setOriginInputOpen(false)
                    setOriginUrl('')
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={busy || actionBusy}
                  onClick={() => {
                    setCreateName(
                      detail.directoryName || observation.repository.name || '',
                    )
                    setCreateVisibility('private')
                    setCreateOpen(true)
                    setOriginInputOpen(false)
                  }}
                  size="sm"
                >
                  Create on GitHub…
                </Button>
                <Button
                  disabled={busy || actionBusy}
                  onClick={() => setOriginInputOpen(true)}
                  size="sm"
                  variant="secondary"
                >
                  Add origin…
                </Button>
              </div>
            )}
          </div>
        )}

        {actionJob && (
          <ActionerProgress
            job={actionJob}
            onRepairCompatibility={onRepairCompatibility}
          />
        )}

        {(detail.intentPlan !== null || showUpgradePlanner) && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {detail.intentPlan !== null && (
              <div className="xl:col-span-7 space-y-4">
                <IntentPlanPanel
                  plan={detail.intentPlan}
                  actionJob={actionJob}
                  actionBusy={actionBusy}
                  inspectionBusy={busy}
                  actionFeedback={actionFeedback}
                  primaryAction={recommendation.primaryAction}
                  reasonCodes={recommendation.reasonCodes}
                  onRunAction={onRunAction}
                />
              </div>
            )}
            {showUpgradePlanner && (
              <div className={`space-y-4 ${detail.intentPlan !== null ? 'xl:col-span-5' : ''}`}>
                <TctbpUpgradePanel
                  repositoryName={observation.repository.name}
                  plan={upgradePlan}
                  busy={upgradeBusy}
                  applyBusy={applyBusy}
                  upgradeFeedback={upgradeFeedback}
                  aiReview={aiReview}
                  aiBusy={aiBusy}
                  aiAcknowledged={aiAcknowledged}
                  onAiAcknowledgedChange={onAiAcknowledgedChange}
                  bootstrapPlan={bootstrapPlan}
                  bootstrapBusy={bootstrapBusy}
                  bootstrapApplyBusy={bootstrapApplyBusy}
                  bootstrapApplyFeedback={bootstrapApplyFeedback}
                  bootstrapJob={bootstrapJob}
                  contractIncompatible={recommendation.reasonCodes.includes(
                    'tctbp-contract-incompatible',
                  )}
                  onPrepareBootstrap={onPrepareBootstrap}
                  onApplyBootstrap={onApplyBootstrap}
                  onLoad={onLoadUpgradePlan}
                  onReviewAi={onReviewAi}
                  onApplyAdditions={onApplyAdditions}
                  onApplyPolicy={onApplyPolicy}
                  onApplyDrifted={onApplyDrifted}
                  onApplyAlignment={onApplyAlignment}
                  onDeleteObsolete={onDeleteObsolete}
                  onApplyInOrder={onApplyInOrder}
                  onCleanupUpgradeBranch={onCleanupUpgradeBranch}
                  onMergeUpgradeBranch={onMergeUpgradeBranch}
                  journeyStage={journeyStage}
                />
              </div>
            )}
          </div>
        )}
      </Section>

      <Section eyebrow="Repository details">
        <RepositoryState observation={observation} />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className={`space-y-4 ${detail.github.status === 'available' ? 'xl:col-span-7' : ''}`}>
            <TctbpPanel observation={observation} />
          </div>
          {detail.github.status === 'available' && (
            <div className="xl:col-span-5 space-y-4">
              <GitHubPanel
                evidence={detail.github}
                localBranch={observation.head.branch}
                localSha={observation.head.sha}
              />
            </div>
          )}
        </div>

        {hasUncertainties && (
          <CollapsiblePanel
            eyebrow="Known limits"
            title="What this inspection cannot prove"
          >
            <ul className="space-y-2 text-sm text-text-secondary list-disc list-inside">
              {recommendation.uncertainties.map((issue) => (
                <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
              ))}
              {observation.tctbp.scaffold.uncertainties.map((message) => (
                <li key={message}>{message}</li>
              ))}
              <li>
                No fetch was performed. Remote comparisons use locally cached
                tracking refs and may not reflect current GitHub state.
              </li>
            </ul>
          </CollapsiblePanel>
        )}
      </Section>
    </div>
  )
}
