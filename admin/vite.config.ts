import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite';

// 本机 Vite 的 scoped style HMR 会命中旧缓存，样式改动直接整页刷新更可靠
function fullReloadForStyleChange(): Plugin {
  return {
    name: 'full-reload-for-style-change',
    handleHotUpdate({ file, modules, server }) {
      if (!file.endsWith('.vue')) return;
      const styleModules = modules.filter((mod) => mod.url.includes('vue&type=style'));
      if (styleModules.length === 0) return;
      server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}

export default defineConfig({
  plugins: [vue(), fullReloadForStyleChange()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 本机文件监听不稳定，Vite 经常缓存旧模块；轮询能保证改文件后立即热更新
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/api': { target: 'http://localhost:3300', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3300', changeOrigin: true },
    },
  },
});
