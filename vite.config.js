import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const dataRoot = resolve(import.meta.dirname, '../biota-data/docs');

function mountLocalData(server) {
  server.middlewares.use('/__data', (request, response, next) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(dataRoot, `.${pathname}`);
    if (!file.startsWith(`${dataRoot}${sep}`) || !existsSync(file) || !statSync(file).isFile()) return next();
    response.setHeader('Content-Type', file.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8');
    createReadStream(file).pipe(response);
  });
}

function localData() {
  return {
    name: 'local-biota-data',
    configureServer: mountLocalData,
    configurePreviewServer: mountLocalData
  };
}

export default defineConfig({
  base: './',
  plugins: [vue(), localData()],
  build: {
    rollupOptions: { input: { index: resolve(import.meta.dirname, 'index.html'), contribute: resolve(import.meta.dirname, 'contribute.html') } }
  }
});
