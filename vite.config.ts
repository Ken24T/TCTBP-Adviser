import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createAdviserPlugin } from './server/vite-plugin'

export default defineConfig({
  plugins: [react(), createAdviserPlugin()],
})
