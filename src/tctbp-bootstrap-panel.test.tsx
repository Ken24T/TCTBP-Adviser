import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TctbpBootstrapPanel } from './components/TctbpBootstrapPanel'

describe('TCTBP bootstrap panel', () => {
  it('renders target configuration inputs without an install action', () => {
    const markup = renderToStaticMarkup(
      <TctbpBootstrapPanel
        repositoryName="ddre-intranet-roadmap"
        busy={false}
        applyBusy={false}
        plan={null}
        applyFeedback={null}
        onPrepare={() => undefined}
        onApply={() => undefined}
      />,
    )

    expect(markup).toContain('Project description')
    expect(markup).toContain('Branch strategy')
    expect(markup).toContain('Prepare bootstrap plan')
    expect(markup).not.toContain('Install TCTBP')
  })
})
