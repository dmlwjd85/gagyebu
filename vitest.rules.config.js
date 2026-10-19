import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/rules/**/*.test.js'], testTimeout: 20000, fileParallelism: false } });
