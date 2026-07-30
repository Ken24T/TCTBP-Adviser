import { loadEnv } from 'vite'

const ADVISER_PREFIX = 'TCTBP_ADVISER_'

export function loadAdviserEnvironment(
  mode: string,
  directory: string,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...loadEnv(mode, directory, ADVISER_PREFIX),
  }
  for (const [name, value] of Object.entries(inherited)) {
    if (name.startsWith(ADVISER_PREFIX) && value !== undefined) {
      environment[name] = value
    }
  }
  return environment
}
