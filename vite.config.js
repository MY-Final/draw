import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 构建时把 sitemap 里的 lastmod 刷成当天日期,避免上线后日期长期不更新。
function sitemapLastmod() {
  return {
    name: 'sitemap-lastmod',
    apply: 'build',
    closeBundle() {
      const file = new URL('./dist/sitemap.xml', import.meta.url)
      const today = new Date().toISOString().slice(0, 10)
      try {
        writeFileSync(file, readFileSync(file, 'utf8').replace(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g, `<lastmod>${today}</lastmod>`))
      } catch {
        // 产物不存在时忽略:不影响构建结果。
      }
    },
  }
}

// 纯静态构建:产物可直接托管到任意静态服务器 / 对象存储 / GitHub Pages。
// base 用相对路径,避免部署到子路径时资源 404。
export default defineConfig({
  base: './',
  plugins: [vue(), sitemapLastmod()],
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
})
