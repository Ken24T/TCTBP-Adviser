import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CardVisibilitySettings } from './components/CardVisibilitySettings'

describe('card visibility settings', () => {
  it('lists repositories with directory subtitles and show/hide controls', () => {
    const markup = renderToStaticMarkup(
      <CardVisibilitySettings
        preferences={{
          ['B'.repeat(24)]: { pinned: false, hidden: true, name: '' },
        }}
        repositories={[
          {
            id: 'A'.repeat(24),
            name: 'DDRE Intranet',
            directoryName: 'ddre-intranet-local',
          },
          {
            id: 'B'.repeat(24),
            name: 'Plain Repo',
            directoryName: 'plain-repo',
          },
        ]}
        onPreferenceChange={() => undefined}
      />,
    )

    expect(markup).toContain('DDRE Intranet')
    expect(markup).toContain('ddre-intranet-local')
    expect(markup).toContain('Plain Repo')
    // Visible repo offers Hide; hidden repo offers Show
    expect(markup).toContain('Hide')
    expect(markup).toContain('Show')
  })

  it('omits the directory subtitle when it matches the display name', () => {
    const markup = renderToStaticMarkup(
      <CardVisibilitySettings
        preferences={{}}
        repositories={[
          { id: 'A'.repeat(24), name: 'audio-extractor', directoryName: 'audio-extractor' },
        ]}
        onPreferenceChange={() => undefined}
      />,
    )

    expect(markup).toContain('audio-extractor')
    expect(markup).not.toContain('<small')
  })
})
