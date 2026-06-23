const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
const dev = process.argv[3] === 'dev';

if (target) {
  if (!['firefox', 'chrome'].includes(target)) {
    console.error('Usage: node scripts/watch.js [firefox|chrome] [dev]');
    process.exit(1);
  }
  const suffix = dev ? '.dev' : '';
  const manifestSrc = `extension/manifests/manifest.${target}${suffix}.json`;
  fs.copyFileSync(manifestSrc, 'extension/manifest.json');
  console.log(`Copied ${target}${dev ? ' dev' : ''} manifest`);
}

const esbuild = path.join('node_modules', '.bin', 'esbuild');

const popup = spawn(
  esbuild,
  ['extension/src/popup.tsx', '--bundle', '--outfile=extension/src/popup.bundle.js',
   '--jsx=automatic', '--jsx-import-source=preact', '--watch'],
  { stdio: 'inherit', shell: true }
);

const content = spawn(
  esbuild,
  ['extension/src/content.js', '--bundle', '--outfile=extension/src/content.bundle.js',
   '--format=iife', '--platform=browser', '--watch'],
  { stdio: 'inherit', shell: true }
);

function kill() {
  popup.kill();
  content.kill();
}

process.on('SIGINT', kill);
process.on('SIGTERM', kill);
