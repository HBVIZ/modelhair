import { defineConfig } from 'vite'

const basePath = process.env.VITE_BASE_PATH || '/modelhair/'
const outDir = process.env.VITE_OUT_DIR || 'docs'

export default defineConfig({
  base: basePath,
  build: {
    outDir
  }
})