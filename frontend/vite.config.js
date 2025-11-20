import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  // Ensure React is in development mode for better error messages
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
  // Enable source maps in development for better debugging
  // Source maps are automatically enabled in dev mode, but we can be explicit
  esbuild: {
    // Keep names for better debugging
    keepNames: true,
  },
  build: {
    outDir: 'dist',
    // Disable source maps in production to avoid exposing source code
    sourcemap: false,
    // Only minify in production builds
    minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
  }
})
