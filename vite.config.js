import { defineConfig } from 'vite'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Pages uses /peka-r/; the Capacitor APK build uses ./ so assets load offline.
const base = process.env.VITE_BASE ?? '/CochesAI-web/'

export default defineConfig({
  base,
  define: { __COCHES_VERSION__: JSON.stringify(pkg.version) },
  build: {
    // Old Android WebViews (APK): Chrome 87+
    target: ['es2020', 'chrome87'],
    cssTarget: 'chrome87',
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: true,
    port: 5173,
  },
})
