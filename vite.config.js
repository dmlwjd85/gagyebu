import { defineConfig } from 'vite';
export default defineConfig({
  base: '/gagyebu/',
  test: { include: ['src/**/*.test.js'], environment: 'node' },
});
