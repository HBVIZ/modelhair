import { defineConfig } from 'vite'
export default defineConfig({
  base: '/modelhair/', // Correct for GitHub Pages
  build: {
    outDir: 'docs'
  }
})