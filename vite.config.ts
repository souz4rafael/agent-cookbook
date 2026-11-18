import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ command, mode }) => {
  if (mode === 'local-recipes' && command !== 'serve') throw new Error('Local recipes are preview-only. Use npm run dev:local; they cannot be built for deployment.')
  return {
    appType: 'mpa',
    resolve: {
      alias: mode === 'local-recipes' ? [{
        find: './generated/recipes.json',
        replacement: fileURLToPath(new URL('./src/generated/local-recipes.json', import.meta.url)),
      }] : [],
    },
    plugins: [react()],
    server: { host: '127.0.0.1', port: 4192, strictPort: true },
    preview: { host: '127.0.0.1', port: 4192, strictPort: true },
    build: {
      rolldownOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
        },
      },
    },
  }
})
