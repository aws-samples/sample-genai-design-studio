/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Virtual Try-On App',
        short_name: 'VTO App',
        description: 'AI-powered Virtual Try-On Application using Amazon Nova Canvas',
        theme_color: '#252F3D',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'vite.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  // 環境変数はimport.meta.envを通してアクセス可能
  // HTMLファイル内の%ENV_VAR%形式の変数も置換する
  envPrefix: 'VITE_',
  esbuild: {
    // Skip TypeScript type checking during build
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
  },
  build: {
    // Continue build even with TypeScript errors
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress certain warnings
        if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return;
        warn(warning);
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
