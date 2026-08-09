import type { RepositoryReference } from '../../shared/reference'
import { Badge } from './primitives'

export function RepositoryReferencePanel({
  reference,
}: {
  reference: RepositoryReference
}) {
  const applicable = reference.workflows.filter(
    (workflow) => workflow.advertised && workflow.applicableToCurrentBranch,
  )
  return (
    <section className="ad-surface p-6" aria-labelledby="branch-map-title">
      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-teal-600">Branch-strategy reference</p>
          <h2 id="branch-map-title" className="text-xl font-semibold text-text-primary">Configured workflow path</h2>
        </div>
        <Badge tone="neutral">{reference.branchWorkflow.strategy ?? 'Unknown strategy'}</Badge>
      </div>

      {reference.branchWorkflow.nodes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 mb-6 p-4 bg-surface-soft rounded-lg">
          {reference.branchWorkflow.nodes.map((node, index) => (
            <div key={`${node.role}-${node.branch}`} className="flex items-center gap-2">
              {index > 0 && <span className="text-text-muted" aria-hidden="true">→</span>}
              <div className="flex flex-col items-center min-w-[6rem] p-3 bg-surface-elevated border border-border rounded-lg">
                <small className="text-[10px] uppercase tracking-widest text-text-muted">{roleLabel(node.role)}</small>
                <strong className="text-text-primary">{node.branch}</strong>
                <code className="mt-1 text-[10px] bg-surface-inset px-1.5 py-0.5 rounded text-text-secondary">{node.deployTrigger}</code>
                {node.promoteTrigger && (
                  <span className="mt-1 text-[10px] text-teal-700">Next: {node.promoteTrigger}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-text-secondary mb-6">No complete branch-role map is advertised.</p>
      )}

      <h3 className="text-sm font-semibold text-text-primary mb-2">Applicable workflows</h3>
      <div className="flex flex-wrap gap-2">
        {applicable.map((workflow) => (
          <Badge key={workflow.id} tone="accent">{workflow.displayName}</Badge>
        ))}
      </div>
    </section>
  )
}

function roleLabel(role: string): string {
  if (role === 'pre-production') return 'Pre-production'
  return role.charAt(0).toUpperCase() + role.slice(1)
}
