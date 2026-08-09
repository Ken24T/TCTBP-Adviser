import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createAdviserPlugin } from './server/vite-plugin'
import { loadAdviserEnvironment } from './server/vite-environment'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    createAdviserPlugin(loadAdviserEnvironment(mode, process.cwd())),
  ],
  server: {
    // The Adviser serves itself, so own-repo git operations (promote, ship,
    // branch switches) rewrite server/ and shared/ while this dev server is
    // running. Vite treats those files as config dependencies and restarts
    // immediately on change; during a branch switch that restart can read
    // files mid-write and load stale modules. Exclude them from Vite's
    // watcher and let the plugin restart with a debounce instead (see
    // server/vite-plugin.ts).
    watch: {
      ignored: [
        '**/server/**',
        '**/shared/**',
      ],
    },
  },
}))
