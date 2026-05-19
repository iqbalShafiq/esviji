import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@svg-builder/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts')
    }
  },
  envDir: '../../',
  server: {
    port: 5173
  }
})
