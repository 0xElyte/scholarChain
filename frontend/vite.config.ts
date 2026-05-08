import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
<<<<<<< HEAD
  plugins: [react(), tailwindcss()],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: [
      'ethers',
      '@reown/appkit',
      '@reown/appkit-adapter-ethers',
      '@reown/appkit/networks',
    ],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
=======
  plugins: [
    react(), 
    tailwindcss(),
    nodePolyfills(),
  ],
  build: { 
    target: 'esnext',
    minify: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
>>>>>>> b9ee48e0d9c3e24eb8304916e91ee64d50b26b69
})
