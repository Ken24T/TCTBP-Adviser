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
import { Panel, Section, Select } from './primitives'
import { cardSurfaceVars, severityTone } from '../card-surface'
import { recommendationTitleFor } from '../presentation'
import { workflowForRecommendation } from '../action-workflows'
import { useTheme } from '../theme'
import { RepositoryDetailHero } from './RepositoryDetailHero'
import { ActionerProgress } from './ActionerProgress'
import { RecommendationPanel } from './RecommendationPanel'
import { RepositoryState } from './RepositoryState'
import { TctbpPanel } from './TctbpPanel'
import { GitHubPanel } from './GitHubPanel'
import { IntentPlanPanel } from './IntentPlanPanel'
import { INTENT_OPTIONS } from '../intent-options'
import { RepositoryReferencePanel } from './RepositoryReferencePanel'
import { TctbpUpgradePanel } from './TctbpUpgradePanel'
import { UpgradeJourneyStrip } from './UpgradeJourneyStrip'

interface RepositoryDetailProps {
  detail: RepositoryDetailResult
  preferences?: PortfolioPreferences
  actionJob: ActionerJob | null
  actionBusy: boolean
  actionFeedback: string | null
  onRunAction: (workflowId: import('../../shared/actioner').ActionerWorkflowId) => void
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
}

export function RepositoryDetail({
  detail,
  preferences = {},
  actionJob,
  actionBusy,
  actionFeedback,
  onRunAction,
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
}: RepositoryDetailProps) {
  const { observation, recommendation } = detail
  const description = observation.tctbp.projectDescription
    ?? 'No project description is available in the TCTBP profile.'
  const recommendedAction = recommendationTitleFor(recommendation)
  const canRunRecommended = Boolean(
    recommendation.primaryAction
    && workflowForRecommendation(recommendation.primaryAction),
  )
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

  return (
    <div className="space-y-8 animate-fade-in ad-detail-themed" style={surface}>
      <RepositoryDetailHero
        busy={busy}
        description={description}
        name={headerName}
        onBack={onBack}
        onRefresh={onRefresh}
        onRunRecommended={canRunRecommended ? onRunRecommended : undefined}
        recommendedAction={recommendedAction}
        runBusy={actionBusy}
        severity={recommendation.severity}
      />

      <UpgradeJourneyStrip
        plan={upgradePlan}
        aiReview={aiReview}
        aiAcknowledged={aiAcknowledged}
        primaryAction={recommendation.primaryAction}
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
        onRefresh={onRefresh}
      />

      <Section eyebrow="Take action">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-3 text-sm text-text-secondary">
            <span className="shrink-0 font-medium">Selected outcome</span>
            <Select
              disabled={busy}
              value={intent}
              onChange={(event) => onIntentChange(
                event.currentTarget.value as RecommendationIntent,
              )}
            >
              {INTENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <p className="text-xs text-text-muted">
            {recommendation.trigger
              ? <>Suggested TCTBP trigger: <code className="px-1.5 py-0.5 bg-surface-inset rounded text-text-primary">{recommendation.trigger}</code></>
              : 'No primary trigger suggested.'}
          </p>
        </div>

        {actionJob && (
          <ActionerProgress
            job={actionJob}
            onRepairCompatibility={onRepairCompatibility}
          />
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          <div className="xl:col-span-7 space-y-8">
            <IntentPlanPanel
              plan={detail.intentPlan}
              actionJob={actionJob}
              actionBusy={actionBusy}
              inspectionBusy={busy}
              actionFeedback={actionFeedback}
              onRunAction={onRunAction}
            />
            <RecommendationPanel recommendation={recommendation} />
          </div>
          <div className="xl:col-span-5 space-y-8">
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
            />
          </div>
        </div>
      </Section>

      <Section eyebrow="Repository details">
        <RepositoryState observation={observation} />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          <div className="xl:col-span-7 space-y-8">
            <TctbpPanel observation={observation} />
          </div>
          <div className="xl:col-span-5 space-y-8">
            <RepositoryReferencePanel reference={detail.reference} />
            <GitHubPanel
              evidence={detail.github}
              localBranch={observation.head.branch}
              localSha={observation.head.sha}
            />
          </div>
        </div>

        <Panel eyebrow="Known limits" title="What this inspection cannot prove" id="uncertainty-title">
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
        </Panel>
      </Section>
    </div>
  )
}
