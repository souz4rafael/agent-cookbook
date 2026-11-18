import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('./copilot', import.meta.url)),
  appType: 'mpa',
  publicDir: false,
  plugins: [react()],
  server: { host: '127.0.0.1', port: 4196, strictPort: true },
  preview: { host: '127.0.0.1', port: 4196, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL('./dist-copilot', import.meta.url)),
    emptyOutDir: true,
  },
})
