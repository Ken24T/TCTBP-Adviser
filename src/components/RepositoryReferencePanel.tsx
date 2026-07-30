import type { RepositoryReference } from '../../shared/reference'

export function RepositoryReferencePanel({
  reference,
}: {
  reference: RepositoryReference
}) {
  const active = reference.guardrails.filter((guardrail) => guardrail.active)
  const applicable = reference.workflows.filter(
    (workflow) => workflow.advertised && workflow.applicableToCurrentBranch,
  )
  return (
    <section className="repository-reference" aria-labelledby="branch-map-title">
      <div className="reference-heading">
        <div>
          <p className="eyebrow">Branch-strategy reference</p>
          <h2 id="branch-map-title">Configured workflow path</h2>
        </div>
        <span>{reference.branchWorkflow.strategy ?? 'Unknown strategy'}</span>
      </div>

      {reference.branchWorkflow.nodes.length > 0 ? (
        <div className="branch-map">
          {reference.branchWorkflow.nodes.map((node, index) => (
            <div className="branch-map-node" key={`${node.role}-${node.branch}`}>
              {index > 0 && <span className="branch-map-arrow">→</span>}
              <div>
                <small>{roleLabel(node.role)}</small>
                <strong>{node.branch}</strong>
                <code>{node.deployTrigger}</code>
                {node.promoteTrigger && (
                  <span>Next: {node.promoteTrigger}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p>No complete branch-role map is advertised.</p>
      )}

      <div className="reference-summary-grid">
        <div>
          <h3>Applicable workflows</h3>
          <div className="reference-chips">
            {applicable.map((workflow) => (
              <span key={workflow.id}>{workflow.displayName}</span>
            ))}
          </div>
        </div>
        <div>
          <h3>Active guardrails</h3>
          {active.length > 0 ? (
            <ul>
              {active.map((guardrail) => (
                <li key={guardrail.id}>
                  <strong>{guardrail.title}</strong>
                  <span>{guardrail.safeResponse}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No core guardrail is currently active.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function roleLabel(role: string): string {
  if (role === 'pre-production') return 'Pre-production'
  return role.charAt(0).toUpperCase() + role.slice(1)
}
