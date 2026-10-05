import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:3000',
    changeOrigin: true,
  },
}

export default defineConfig({
  root: 'frontend',
  envDir: '..',
  publicDir: 'data',
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'frontend/index.html'),
        reservations: resolve(process.cwd(), 'frontend/reservas.html'),
      },
    },
  },
  plugins: [
    tailwindcss(),
    {
      name: 'emit-pwa-icon',
      async generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'assets/icon.svg',
          source: await readFile(new URL('./frontend/assets/icon.svg', import.meta.url)),
        })
      },
    },
    VitePWA({
      strategies: 'injectManifest',      // usamos nuestro propio service worker
      srcDir: 'pages',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: false,             // el registro se hace en main.js
      // cupos.json queda fuera del precaché: lo gestiona la estrategia network-first del SW
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
      manifest: {
        name: 'Red Salud Pública – Interconsultas',
        short_name: 'Interconsultas',
        lang: 'es-CL',
        display: 'standalone',
        start_url: '/',
        theme_color: '#0f5c55',
        background_color: '#f4f7f6',
        icons: [{ src: 'assets/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
})
