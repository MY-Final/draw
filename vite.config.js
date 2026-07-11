import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 纯静态构建:产物可直接托管到任意静态服务器 / 对象存储 / GitHub Pages。
// base 用相对路径,避免部署到子路径时资源 404。
export default defineConfig({
  base: './',
  plugins: [vue()],
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
})
