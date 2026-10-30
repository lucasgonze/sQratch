// @ts-check
// Verifies that `node scripts/build.js` produces a clean, comment-free dist/.
// These tests are Node-only — no browser fixture is used.
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

test.describe.serial('build script output', () => {
  test.beforeAll(() => {
    execSync('node scripts/build.js', { cwd: ROOT, stdio: 'ignore' });
  });

  test('dist/index.html exists', () => {
    expect(fs.existsSync(path.join(DIST, 'index.html'))).toBe(true);
  });

  test('dist/index.html contains no HTML comments', () => {
    const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
    // Allow IE conditional comments (<!--[if ...]) but strip all others
    expect(html).not.toMatch(/<!--(?!\[if\s)/);
  });

  test('dist/index.html contains no JS block comments', () => {
    const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
    expect(html).not.toMatch(/\/\*/);
  });

  test('test HTML files are excluded from dist/', () => {
    const files = fs.readdirSync(DIST);
    const testFiles = files.filter(f => /^test/i.test(f) && f.endsWith('.html'));
    expect(testFiles).toHaveLength(0);
  });

  test('doc/ directory is excluded from dist/', () => {
    expect(fs.existsSync(path.join(DIST, 'doc'))).toBe(false);
  });

  test('dist/index.html is smaller than source (comments stripped)', () => {
    const src  = fs.statSync(path.join(ROOT, 'site', 'index.html')).size;
    const dist = fs.statSync(path.join(DIST, 'index.html')).size;
    expect(dist).toBeLessThan(src);
  });
});
