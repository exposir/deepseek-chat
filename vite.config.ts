/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages 子路径部署（https://exposir.github.io/deepseek-chat/）
  base: '/deepseek-chat/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'DeepSeek Chat',
        short_name: 'DS Chat',
        description: '移动优先的 DeepSeek 聊天应用：流式问答 + 思维链 + 联网搜索',
        lang: 'zh-CN',
        display: 'standalone',
        orientation: 'portrait',
        id: '/deepseek-chat/',
        start_url: '/deepseek-chat/',
        scope: '/deepseek-chat/',
        background_color: '#0f1117',
        theme_color: '#0f1117',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 仅预缓存应用壳；Shiki 语言包（数百个懒加载 chunk）按需走网络，不预缓存；
        // API 请求一律不缓存（fetch 直连，未注册 runtimeCaching 即 network-only）
        globPatterns: [
          '**/*.{css,html,svg,png,woff2}',
          'assets/index-*.js',
          'assets/markdown-*.js',
        ],
        navigateFallback: '/deepseek-chat/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          markdown: ['streamdown', '@streamdown/code', '@streamdown/math', '@streamdown/cjk'],
        },
      },
    },
  },
});
