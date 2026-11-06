import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envDir: '..',
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-runtime',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            { name: 'material-ui', test: /node_modules[\\/](@mui|@emotion)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    proxy: Object.fromEntries(
      ['/api', '/health', '/mcp'].map((path) => [
        path,
        { target: 'http://127.0.0.1:8000', changeOrigin: false },
      ]),
    ),
  },
  test: {
    maxWorkers: 2,
    testTimeout: 15000,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    clearMocks: true,
  },
});
