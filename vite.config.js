import { defineConfig } from 'vite'

export default defineConfig({
  base: '/', // For Netlify
  build: {
    outDir: 'docs' // Standard Vite output
  }
})
