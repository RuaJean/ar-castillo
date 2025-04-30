import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Ruta base para todos los assets y URLs
  
  // Configuración del servidor de desarrollo simplificada
  server: {
    host: true, // Escuchar en todas las interfaces de red
    port: 3000,
    strictPort: false,
    open: true // Abrir navegador automáticamente
  },
  
  // Configuración para construcción de producción
  build: {
    // Generar archivo _redirects para hosting como Netlify
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Mantener nombres más predecibles para evitar problemas con las rutas
        entryFileNames: 'assets/js/[name].[hash].js',
        chunkFileNames: 'assets/js/[name].[hash].js',
        assetFileNames: ({ name }) => {
          if (/\.(gif|jpe?g|png|svg)$/.test(name ?? '')) {
            return 'assets/images/[name].[hash][extname]';
          }
          if (/\.(woff|woff2|eot|ttf|otf)$/.test(name ?? '')) {
            return 'assets/fonts/[name].[hash][extname]';
          }
          if (/\.css$/.test(name ?? '')) {
            return 'assets/css/[name].[hash][extname]';
          }
          return 'assets/[name].[hash][extname]';
        }
      }
    }
  },
  
  // Optimizaciones adicionales
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'three'],
    exclude: ['@ar-js-org/ar.js'] // Excluir AR.js de la optimización para evitar problemas
  },
  
  // Configuración de resolución de módulos
  resolve: {
    alias: {
      'three': 'three',
      '@': '/src'
    }
  }
})
