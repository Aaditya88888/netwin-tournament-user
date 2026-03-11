import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["netwin-logo.png"],
      manifest: {
        name: "Netwin Tournament",
        short_name: "Netwin",
        description: "Netwin gaming tournament platform",
        theme_color: "#000000",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/netwin-logo.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/netwin-logo.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    })
  ],
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
      '@components': path.resolve(__dirname, './src/components'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@context': path.resolve(__dirname, './src/context'),
      '@lib': path.resolve(__dirname, './src/lib')
    }
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/analytics', 'firebase/app-check'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs', '@radix-ui/react-toast'],
          'lucide-vendor': ['lucide-react'],

          // Feature chunks
          'admin-pages': [
            // './src/pages/admin/AdminDashboard',
            // './src/pages/admin/ReviewMatches', 
            // './src/pages/admin/KycRequests',
            // './src/pages/admin/ManageUsers'
          ], 'tournament-pages': [
            './src/pages/tournaments/Tournaments',
            './src/pages/tournaments/TournamentDetails',
            './src/components/tournaments/TournamentCard'
          ], 'profile-pages': [
            './src/pages/profile/Profile',
            './src/pages/profile/KycVerification'
          ],
          'chart-vendor': ['recharts'],
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod']
        }
      }
    }
  },
  server: {
    port: 5174, // Main app frontend on 5174
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // Updated to match backend
        changeOrigin: true,
        secure: false
      }
    }
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'lucide-react'
    ]
  }
});
