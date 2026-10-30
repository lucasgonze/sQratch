#!/usr/bin/env node
// Build a stripped runtime copy of site/ into dist/.
// Removes comments, test files, and documentation.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'site');
const DEST = path.join(__dirname, '..', 'dist');

// Files/directories to exclude from dist entirely
const EXCLUDE = new Set([
  'doc',
  'test.html',
  'test-clipboard.html',
  'test-i18n-cursor.html',
  'test-markdown.html',
  '.DS_Store',
]);

function stripComments(html) {
  // Remove HTML comments (<!-- ... -->), but preserve IE conditional comments
  html = html.replace(/<!--(?!\[if\s)[\s\S]*?-->/g, '');

  // Remove block comments inside <style> blocks (CSS)
  html = html.replace(
    /(<style[\s\S]*?>)([\s\S]*?)(<\/style>)/gi,
    (_, open, body, close) => open + stripCssBlockComments(body) + close
  );

  // Remove block comments inside <script> blocks (JS)
  // Uses a state machine to avoid mangling strings or regex literals.
  html = html.replace(
    /(<script[\s\S]*?>)([\s\S]*?)(<\/script>)/gi,
    (_, open, body, close) => open + stripJsBlockComments(body) + close
  );

  // Collapse runs of blank lines left by removed comments
  html = html.replace(/\n{3,}/g, '\n\n');

  return html;
}

function stripCssBlockComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripJsBlockComments(src) {
  // Only strip comments where /* or /** starts on its own line (possibly indented).
  // This avoids false positives inside string literals and regex literals such as
  // /`([^`]+)`/g or /```...```/g, which confused the character-by-character approach.
  return src.replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*\n/gm, '');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (EXCLUDE.has(entry)) continue;

    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry === 'index.html') {
      const raw = fs.readFileSync(srcPath, 'utf8');
      fs.writeFileSync(destPath, stripComments(raw), 'utf8');
      console.log(`  stripped  ${path.relative(SRC, srcPath)}`);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  copied    ${path.relative(SRC, srcPath)}`);
    }
  }
}

if (fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true });
console.log(`Building ${SRC} → ${DEST}`);
copyDir(SRC, DEST);
console.log('Done.');
