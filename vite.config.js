import { defineConfig } from 'vite'

export default defineConfig({
  base: '/', // For Netlify
  build: {
    outDir: 'dist' // Standard Vite output
  }
})
