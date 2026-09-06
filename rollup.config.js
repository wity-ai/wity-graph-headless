import terser from '@rollup/plugin-terser';

export default [
  // Unminified ESM — for bundlers (Vite, webpack, rollup)
  {
    input: 'index.js',
    output: {
      file:      'dist/graph-headless.esm.js',
      format:    'es',
      sourcemap: true,
    },
  },
  // Minified ESM — for CDN / direct browser use
  {
    input: 'index.js',
    output: {
      file:      'dist/graph-headless.esm.min.js',
      format:    'es',
      sourcemap: true,
      plugins:   [terser()],
    },
  },
  // CJS — for Node.js require() (e.g. babel-node consumers)
  {
    input: 'index.js',
    output: {
      file:      'dist/graph-headless.cjs',
      format:    'cjs',
      sourcemap: true,
      exports:   'named',
    },
  },
];
