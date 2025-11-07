// vite.config.js - change to:
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/', // Root path for Netlify
  build: {
    outDir: 'docs'
  }
})
