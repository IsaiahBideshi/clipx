import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: 'public/clip-player',
    rollupOptions: {
      input: 'src/sharePlayer.jsx',
      output: {
        entryFileNames: 'player.js',
        assetFileNames: 'player[extname]',
      },
    },
  },
})
