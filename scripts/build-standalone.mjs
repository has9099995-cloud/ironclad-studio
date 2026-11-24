import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const rootDir = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');
const outFilePublic = path.join(publicDir, 'operation-ironclad.html');
const outFileDist = path.join(distDir, 'operation-ironclad.html');

// Remove stale standalone file before running Vite so it isn't redundantly processed
if (fs.existsSync(outFilePublic)) {
  fs.unlinkSync(outFilePublic);
}

console.log('[standalone] Building production CSS via Vite...');
execSync('npx vite build', { cwd: rootDir, stdio: 'inherit' });

const assetsDir = path.join(distDir, 'assets');
const cssFiles = fs
  .readdirSync(assetsDir)
  .filter((f) => f.endsWith('.css'))
  .sort();

if (cssFiles.length === 0) {
  throw new Error('Expected compiled CSS in dist/assets/*.css');
}

const cssContent = cssFiles
  .map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf8'))
  .join('\n')
  .replace(/<\/style/gi, '<\\/style');

console.log('[standalone] Bundling single-file IIFE runtime via esbuild...');
const result = await build({
  entryPoints: [path.join(rootDir, 'src/main.tsx')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: ['es2022'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  plugins: [
    {
      name: 'skip-css-imports',
      setup(pluginBuild) {
        pluginBuild.onLoad({ filter: /\.css$/ }, () => ({
          contents: '',
          loader: 'js',
        }));
      },
    },
  ],
});

const jsBundle = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = `<!doctype html>
<html lang="en" style="background-color: #0b0e12;">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Operation: Ironclad — Standalone Offline Edition</title>
    <style>
${cssContent}
    </style>
  </head>
  <body class="bg-[#0b0e12] text-slate-100 overflow-hidden select-none" style="background-color: #0b0e12; color: #f1f5f9;">
    <div id="root"></div>
    <script>
${jsBundle}
    </script>
  </body>
</html>
`;

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(outFilePublic, html, 'utf8');
if (fs.existsSync(distDir)) {
  fs.writeFileSync(outFileDist, html, 'utf8');
}

const sizeMb = (Buffer.byteLength(html, 'utf8') / (1024 * 1024)).toFixed(2);
console.log(`[standalone] Wrote ${outFilePublic} (${sizeMb} MB)`);
