import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WORKFLOW_REFERENCES } from './reference/workflows'
import {
  compareTctbpPolicy,
  mergeCanonicalTctbpPolicy,
  parseTctbpPolicy,
} from './tctbp-policy'

const require = createRequire(import.meta.url)

const TCTBP_WEB_ROOT = process.env.TCTBP_ADVISER_TCTBP_WEB_ROOT
  ?? path.resolve(__dirname, '..', '..', 'TCTBP-Web')

interface ScaffoldedProfile {
  adviserVocabulary: { workflowIds: string[] }
  activation: { triggers: string[] }
  project: { name: string }
  profile: { commands: Record<string, string | null> }
  governance: { templateMode: boolean }
}

function runScaffold(targetProject: string): void {
  execFileSync(
    process.execPath,
    [
      path.join(TCTBP_WEB_ROOT, 'scripts', 'tctbp-run-scaffold.js'),
      '--name', 'proving-project',
      '--target', targetProject,
      '--working', 'development',
      '--strategy', 'staged',
      '--framework', 'vite',
      '--deploy', 'none yet',
      '--test', 'vitest',
      '--skip-install',
      '--skip-remote',
    ],
    {
      cwd: TCTBP_WEB_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    },
  )
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

/**
 * Phase 7 end-to-end proving exercise (ecosystem consolidation plan).
 *
 * Proves with a throwaway scaffolded project that:
 *   1. a fresh scaffold succeeds;
 *   2. the Adviser inspection/policy comparison sees it as aligned;
 *   3. the scaffolded workflow catalogue agrees with the Adviser reference;
 *   8. Copilot in the target repo recognises the same workflow set (its own
 *      canonical catalogue audit reports no drift);
 *   4-5. simulated managed-surface drift is detected;
 *   6-7. the canonical merge generates an upgrade-safe profile;
 *   9. no application-owned configuration is lost.
 */
describe('Phase 7 ecosystem proving exercise', () => {
  it('scaffolds a project that agrees with the canonical catalogue, detects drift, and preserves project-owned values', () => {
    expect(fs.existsSync(TCTBP_WEB_ROOT)).toBe(true)

    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tctbp-proving-'))
    const project = path.join(base, 'project')
    try {
      // 1. Scaffold a throwaway project from the canonical TCTBP-Web.
      runScaffold(project)

      const profilePath = path.join(project, '.github', 'TCTBP.json')
      const sourcePath = path.join(project, '.tctbp', 'source.json')
      expect(fs.existsSync(profilePath)).toBe(true)
      expect(fs.existsSync(sourcePath)).toBe(true)

      const canonicalContent = fs.readFileSync(
        path.join(TCTBP_WEB_ROOT, '.github', 'TCTBP.json'),
        'utf8',
      )
      const profile = readJson(profilePath) as unknown as ScaffoldedProfile
      const source = readJson(sourcePath)

      // 3. Workflow catalogue agreement: the scaffolded project advertises the
      //    same workflow set the Adviser reference catalogue models.
      const adviserIds = WORKFLOW_REFERENCES.map((workflow) => workflow.id).sort()
      const projectIds = [...profile.adviserVocabulary.workflowIds].sort()
      expect(projectIds).toEqual(adviserIds)

      // 8. Copilot in the target repo recognises the same workflow set: the
      //    scaffolded project's own canonical catalogue audit reports no
      //    drift (the factory-only scaffold workflow is the sole exception).
      const auditCatalogue = require(
        path.join(project, 'scripts', 'tctbp-workflow-catalogue.js'),
      ).auditCatalogue
      const violations = auditCatalogue(profile, {
        scaffoldRunnerFiles: require(
          path.join(project, 'scripts', 'tctbp-managed-surface.js'),
        ).RUNNER_FILES,
        agentFrontmatter: fs.readFileSync(
          path.join(project, '.github', 'agents', 'TCTBP.agent.md'),
          'utf8',
        ),
        existingRunners: fs
          .readdirSync(path.join(project, 'scripts'))
          .filter((file) => file.startsWith('tctbp-run-') && file.endsWith('.js')),
      }) as Array<{ code: string; workflowId: string | null }>
      const nonFactoryViolations = violations.filter(
        (violation) => violation.workflowId !== 'scaffold',
      )
      expect(nonFactoryViolations).toEqual([])
      // The factory-only scaffold workflow is intentionally absent from
      // scaffolded projects: its triggers are not generated and its runner is
      // not copied.
      expect(violations).toEqual([
        expect.objectContaining({ code: 'alias-not-activated', workflowId: 'scaffold' }),
        expect.objectContaining({ code: 'runner-missing', workflowId: 'scaffold' }),
      ])

      // 2. Adviser policy comparison: canonical vs scaffolded are aligned.
      const comparison = compareTctbpPolicy(
        parseTctbpPolicy(canonicalContent),
        parseTctbpPolicy(fs.readFileSync(profilePath, 'utf8')),
      )
      expect(comparison.state).toBe('aligned')

      // Source metadata records the canonical revision and full managed surface.
      expect(source.sourceRepository).toBe('Ken24T/TCTBP-Web')
      expect(source.installedSchemaVersion).toBe(11)
      const managedSurface = source.managedSurface as string[]
      expect(managedSurface).toContain('scripts/tctbp-run-hotfix.js')
      expect(managedSurface).toContain('scripts/tctbp-run-preflight.js')
      expect(managedSurface).toContain('scripts/tctbp-managed-surface.js')
      expect(managedSurface).toContain('scripts/tctbp-workflow-catalogue.js')

      // The canonical trigger families are present in the generated profile.
      const triggers = new Set(profile.activation.triggers)
      for (const trigger of [
        'preflight', 'preflight please',
        'release', 'prepare release',
        'hotfix start', 'emergency fix',
        'ticket create', 'promote review please',
      ]) {
        expect(triggers.has(trigger)).toBe(true)
      }

      // 4. Simulate managed-surface drift: drop preflight from the project.
      const drifted = JSON.parse(JSON.stringify(profile)) as ScaffoldedProfile
      drifted.adviserVocabulary.workflowIds =
        drifted.adviserVocabulary.workflowIds.filter((id) => id !== 'preflight')
      drifted.activation.triggers = drifted.activation.triggers.filter(
        (trigger) => trigger !== 'preflight' && trigger !== 'preflight please',
      )

      // 5. Confirm the Adviser detects the drift.
      const driftedComparison = compareTctbpPolicy(
        parseTctbpPolicy(canonicalContent),
        parseTctbpPolicy(JSON.stringify(drifted)),
      )
      expect(driftedComparison.state).toBe('drifted')
      expect(
        driftedComparison.differences.some(
          (difference) => difference.area === 'workflows'
            && difference.message.includes('preflight'),
        ),
      ).toBe(true)

      // 6-7. Upgrade plan: the safe canonical merge restores the canonical
      //      surface while preserving project-owned values.
      const merged = mergeCanonicalTctbpPolicy(
        canonicalContent,
        JSON.stringify(drifted),
      )
      const mergedProfile = JSON.parse(merged as string) as unknown as ScaffoldedProfile
      expect(mergedProfile.adviserVocabulary.workflowIds).toContain('preflight')
      // 9. No application-owned configuration is lost.
      expect(mergedProfile.project.name).toBe('proving-project')
      expect(mergedProfile.profile.commands.test).toBe('npm run test')
      expect(mergedProfile.governance.templateMode).toBe(false)
    } finally {
      fs.rmSync(base, { recursive: true, force: true })
    }
  }, 120_000)
})
