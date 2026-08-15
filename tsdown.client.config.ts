import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { client: 'src/client/index.tsx' },
  outDir: 'client',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  clean: true,
  deps: { neverBundle: ['react', 'react/jsx-runtime'] },
  outExtensions: () => ({ js: '.js' }),
  outputOptions: {
    banner: 'window.__ModuleLoader__.load({ id: "dsh-plugin-market", factory: (require) => { const module = { exports: {} }; const exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})
