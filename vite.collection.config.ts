import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// Preview the assembled static collection, never a development proxy to private files.
export default defineConfig({
  root: fileURLToPath(new URL('./hub', import.meta.url)),
  appType: 'mpa',
  publicDir: false,
  preview: { host: '127.0.0.1', port: 4197, strictPort: true },
  build: { outDir: fileURLToPath(new URL('./dist-collection', import.meta.url)) },
})
