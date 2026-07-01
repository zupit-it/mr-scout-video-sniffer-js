import { defineConfig } from 'tsup';

// Build a doppio formato (ESM + CJS) con file di dichiarazione .d.ts.
// ESM e' il formato principale (usato da Angular/Vite/moderni bundler);
// CJS e' incluso per compatibilita' con toolchain piu' datate.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  // La libreria e' framework-agnostica e non deve inglobare mediainfo.js:
  // resta una peerDependency iniettata dall'app consumatrice.
  external: ['mediainfo.js'],
});
