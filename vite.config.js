import { defineConfig } from 'vite'

export default defineConfig(({ command, mode }) => {
  // Use environment variable or build command to determine base
  const isGitHub = process.env.GITHUB_ACTIONS === 'true' || process.argv.includes('--github')
  
  return {
    base: isGitHub ? '/modelhair/' : '/',
    build: {
      outDir: 'docs'
    }
  }
})
