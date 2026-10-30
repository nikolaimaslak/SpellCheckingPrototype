import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

export default defineConfig({
  build: {
    // 1. Specify your backend script entry point
    ssr: 'server/index.js', 
    outDir: 'server-dist',
    emptyOutDir: false, // Prevent Vite from emptying the current directory before build
    minify: false, // Set to true if you want to obfuscate/minify code
    rollupOptions: {
      // 2. Ensure Node built-ins (path, fs, etc.) are not bundled
      external: [
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`)
      ],
      output: {
        // 3. Keep the file structure simple (outputs a single bundle file)
        entryFileNames: 'server.js',
        format: 'esm' // Outputs modern ES Modules
      }
    }
  },
  ssr: {
    // Crucial: Tells Vite to bundle Express and other node_modules 
    // instead of expecting them to be present in production
    noExternal: true 
  }
});