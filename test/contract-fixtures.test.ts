import Ajv from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import longLived from '../contracts/adviser-v1/fixtures/long-lived-diverged.json'
import simple from '../contracts/adviser-v1/fixtures/simple-clean.json'
import staged from '../contracts/adviser-v1/fixtures/staged-dirty.json'
import schema from '../schemas/tctbp-adviser-inspection-v1.schema.json'
import type {
  GitOperation,
  LocalSyncState,
} from '../shared/inspection'
import { recommend } from '../server/recommendations/engine'
import { observationFixture } from './observation-fixture'

const NOW = new Date('2026-07-30T01:00:01.000Z')
const validate = new Ajv({ strict: false }).compile(schema)

const FIXTURES = [
  {
    name: 'simple',
    document: simple,
    strategy: 'simple',
    action: null,
    disposition: 'none',
  },
  {
    name: 'staged',
    document: staged,
    strategy: 'staged',
    action: 'checkpoint',
    disposition: 'action',
  },
  {
    name: 'long-lived',
    document: longLived,
    strategy: 'long-lived-environment-branches',
    action: null,
    disposition: 'stop',
  },
] as const

describe('pinned TCTBP-Web contract fixtures', () => {
  it.each(FIXTURES)(
    'validates and recommends safely for $name branch roles',
    ({ document, strategy, action, disposition }) => {
      expect(validate(document), JSON.stringify(validate.errors)).toBe(true)
      expect(document.observation?.branchModel.strategy).toBe(strategy)

      const observation = document.observation
      if (!observation) throw new Error('Fixture has no observation.')
      const result = recommend(
        observationFixture({
          clean: observation.workingTree.clean,
          syncState: syncState(
            observation.localTracking.current.sync.state,
          ),
          operations: observation.operations as GitOperation[],
          detached: observation.head.detached,
        }),
        'none',
        NOW,
      )

      expect(result.disposition).toBe(disposition)
      expect(result.primaryAction).toBe(action)
    },
  )
})

function syncState(value: string): LocalSyncState {
  const supported: LocalSyncState[] = [
    'in-sync',
    'ahead',
    'behind',
    'diverged',
    'unpublished',
    'unknown',
  ]
  if (!supported.includes(value as LocalSyncState)) {
    throw new Error(`Unsupported fixture sync state: ${value}`)
  }
  return value as LocalSyncState
}
