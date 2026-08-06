import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createAdviserPlugin } from './server/vite-plugin'
import { loadAdviserEnvironment } from './server/vite-environment'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    createAdviserPlugin(loadAdviserEnvironment(mode, process.cwd())),
  ],
}))
