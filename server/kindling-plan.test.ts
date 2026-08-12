import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  compareTctbpPolicy,
  mergeCanonicalTctbpPolicy,
  parseTctbpPolicy,
} from './tctbp-policy'

const require = createRequire(import.meta.url)

const TCTBP_WEB_ROOT = process.env.TCTBP_WEB_ROOT
  ?? '/home/ken/Documents/development/repos/TCTBP-Web'
const TARGET_ROOT = process.env.TARGET_ROOT
  ?? '/home/ken/Documents/development/repos/kindling'
const PLAN_OUT = process.env.PLAN_OUT
  ?? path.join(os.tmpdir(), 'tctbp-reconcile-merged.json')

// Read-only reconcile plan for a target repo: real merge machinery, no writes
// to the target. Produces the merged profile artifact + a plan report.
// Usage: TARGET_ROOT=/path/to/repo npx vitest run server/kindling-plan.test.ts
describe('kindling reconcile plan (read-only)', () => {
  it('computes drift and merged profile, writes the plan artifact', () => {
    const canonical = fs.readFileSync(
      path.join(TCTBP_WEB_ROOT, '.github', 'TCTBP.json'),
      'utf8',
    )
    const targetContent = fs.readFileSync(
      path.join(TARGET_ROOT, '.github', 'TCTBP.json'),
      'utf8',
    )
    const before = JSON.parse(targetContent)

    // 1. Drift report.
    const comparison = compareTctbpPolicy(
      parseTctbpPolicy(canonical),
      parseTctbpPolicy(targetContent),
    )
    console.log('DRIFT state:', comparison.state)
    for (const difference of comparison.differences) {
      console.log('DRIFT:', difference.area, '-', difference.message)
    }

    // 2. Merged profile via the real machinery.
    const mergedRaw = mergeCanonicalTctbpPolicy(canonical, targetContent) as string
    const merged = JSON.parse(mergedRaw)
    fs.writeFileSync(PLAN_OUT, mergedRaw)
    console.log('PLAN wrote:', PLAN_OUT)

    const beforeTriggers = new Set<string>(before.activation?.triggers ?? [])
    const afterTriggers: string[] = merged.activation?.triggers ?? []
    const added = afterTriggers.filter((trigger) => !beforeTriggers.has(trigger))
    const removed = [...beforeTriggers].filter(
      (trigger) => !afterTriggers.includes(trigger),
    )
    console.log('PLAN triggers before/after:', before.activation?.triggers?.length, '->', afterTriggers.length)
    console.log('PLAN triggers added:', JSON.stringify(added))
    console.log('PLAN triggers removed:', JSON.stringify(removed))
    console.log('PLAN ship preferredTriggers:', JSON.stringify(merged.ship?.preferredTriggers))
    console.log('PLAN release section present:', !!merged.release)
    console.log('PLAN vocab:', before.adviserVocabulary?.workflowIds?.length, '->', merged.adviserVocabulary?.workflowIds?.length)

    // 3. Audit the MERGED profile with the canonical catalogue + manifest.
    const { auditCatalogue } = require(
      path.join(TCTBP_WEB_ROOT, 'scripts', 'tctbp-workflow-catalogue.js'),
    )
    const { RUNNER_FILES } = require(
      path.join(TCTBP_WEB_ROOT, 'scripts', 'tctbp-managed-surface.js'),
    )
    const agentFrontmatter = fs.readFileSync(
      path.join(TARGET_ROOT, '.github', 'agents', 'TCTBP.agent.md'),
      'utf8',
    )
    const existingRunners = fs
      .readdirSync(path.join(TARGET_ROOT, 'scripts'))
      .filter((file) => file.startsWith('tctbp-run-') && file.endsWith('.js'))
    const violations = auditCatalogue(merged, {
      scaffoldRunnerFiles: RUNNER_FILES,
      agentFrontmatter,
      existingRunners,
    }) as Array<{ code: string; workflowId: string | null }>
    console.log('PLAN audit violations:', JSON.stringify(violations.map(
      (violation) => violation.code + '@' + (violation.workflowId ?? '-'),
    )))

    // 4. Canonical-managed file diff summary.
    const adds: string[] = []
    const changes: string[] = []
    for (const file of RUNNER_FILES) {
      const src = path.join(TCTBP_WEB_ROOT, 'scripts', file)
      const dst = path.join(TARGET_ROOT, 'scripts', file)
      if (!fs.existsSync(dst)) adds.push(`scripts/${file}`)
      else if (!fs.readFileSync(src).equals(fs.readFileSync(dst))) changes.push(`scripts/${file}`)
    }
    for (const file of ['TCTBP Agent.md', 'TCTBP Cheatsheet.md', 'agents/TCTBP.agent.md', 'hooks/tctbp-safety.json'] as const) {
      const src = path.join(TCTBP_WEB_ROOT, '.github', file)
      const dst = path.join(TARGET_ROOT, '.github', file)
      if (!fs.existsSync(dst)) adds.push(`.github/${file}`)
      else if (!fs.readFileSync(src).equals(fs.readFileSync(dst))) changes.push(`.github/${file}`)
    }
    console.log('PLAN file adds:', JSON.stringify(adds))
    console.log('PLAN file changes:', JSON.stringify(changes))
  }, 30_000)
})
