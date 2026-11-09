import { defineConfig } from 'vite'

const stripCrossorigin = () => ({
  name: 'strip-crossorigin',
  enforce: 'post',
  transformIndexHtml: html => html.replaceAll(' crossorigin', ''),
})

export default defineConfig({
  base: './',
  plugins: [stripCrossorigin()],
  build: {
    sourcemap: false,
    assetsInlineLimit: 0,
  },
})

