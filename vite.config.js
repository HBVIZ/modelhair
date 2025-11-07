import { defineConfig } from 'vite'

export default defineConfig({
  base: '/modelhair/', // For Netlify
  build: {
    outDir: 'docs' // Standard Vite output
  }
})
