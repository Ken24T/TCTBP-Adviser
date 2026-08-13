import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Callout } from './components/Callout'

describe('Callout', () => {
  it('hides the popover content by default', () => {
    const markup = renderToStaticMarkup(
      <Callout label="Why Checkpoint">
        <p>Hidden explanation</p>
      </Callout>,
    )

    // The trigger is visible and announces its expanded state; the content
    // only renders once opened.
    expect(markup).toContain('Why Checkpoint')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('Hidden explanation')
  })

  it('renders the popover content when open', () => {
    const markup = renderToStaticMarkup(
      <Callout defaultOpen label="Why Checkpoint">
        <p>Visible explanation</p>
      </Callout>,
    )

    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain('role="tooltip"')
    expect(markup).toContain('Visible explanation')
  })
})
