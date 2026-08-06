import type {
  RecommendationAction,
  RecommendationStep,
} from '../../shared/recommendation'

interface ActionDescription {
  trigger: string | null
  kind: RecommendationStep['kind']
  does: string[]
  doesNot: string[]
}

const ACTIONS: Record<RecommendationAction, ActionDescription> = {
  'refresh-inspection': {
    trigger: null,
    kind: 'diagnostic',
    does: ['Refreshes local observations through the Adviser service.'],
    doesNot: ['Does not fetch or mutate the repository.'],
  },
  checkpoint: {
    trigger: 'checkpoint please',
    kind: 'workflow',
    does: ['Preserves tracked and untracked work in a local commit.'],
    doesNot: ['Does not push, merge, tag, version, deploy or ship.'],
  },
  publish: {
    trigger: 'publish please',
    kind: 'workflow',
    does: ['Publishes the current branch to its configured origin.'],
    doesNot: ['Does not merge, tag, version, deploy or ship.'],
  },
  resume: {
    trigger: 'resume please',
    kind: 'workflow',
    does: ['Updates a clean local branch from its local tracking evidence.'],
    doesNot: ['Does not preserve dirty work or resolve divergence.'],
  },
  handover: {
    trigger: 'handover please',
    kind: 'workflow',
    does: ['Preserves work, records continuation context and publishes it.'],
    doesNot: ['Does not merge, promote, deploy or ship.'],
  },
  'abort-dry-run': {
    trigger: null,
    kind: 'diagnostic',
    does: ['Shows how TCTBP would diagnose an interrupted workflow.'],
    doesNot: ['Does not abort or discard repository state.'],
  },
  'inspect-recovery': {
    trigger: null,
    kind: 'diagnostic',
    does: ['Requests manual inspection of recovery evidence.'],
    doesNot: ['Does not alter Git state.'],
  },
  'reattach-branch': {
    trigger: null,
    kind: 'guidance',
    does: ['Guides recovery from detached HEAD.'],
    doesNot: ['Does not choose or switch branches automatically.'],
  },
  'install-tctbp': {
    trigger: null,
    kind: 'guidance',
    does: ['Shows TCTBP installation or scaffold guidance.'],
    doesNot: ['Does not install or modify repository files.'],
  },
  'review-compatibility': {
    trigger: null,
    kind: 'guidance',
    does: ['Explains the unsupported contract or missing capability.'],
    doesNot: ['Does not upgrade or replace TCTBP infrastructure.'],
  },
}

export function stepFor(action: RecommendationAction): RecommendationStep {
  const description = ACTIONS[action]
  return {
    action,
    trigger: description.trigger,
    kind: description.kind,
  }
}

export function effectsFor(actions: RecommendationAction[]) {
  return {
    does: unique(actions.flatMap((action) => ACTIONS[action].does)),
    doesNot: unique(actions.flatMap((action) => ACTIONS[action].doesNot)),
  }
}

export function triggerFor(action: RecommendationAction | null): string | null {
  return action === null ? null : ACTIONS[action].trigger
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}
