#!/usr/bin/env node
// Static file server for site/. Run with --no-open to suppress browser launch.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(__dirname, '..', 'site');
const PORT = process.env.PORT || 3000;
const openBrowser = !process.argv.includes('--no-open');

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.txt':  'text/plain',
  '.xml':  'application/xml',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(SITE_DIR, urlPath);

  // Prevent path traversal outside site/
  if (!filePath.startsWith(SITE_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        const notFound = path.join(SITE_DIR, '404.html');
        fs.readFile(notFound, (e2, d2) => {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end(e2 ? 'Not found' : d2);
        });
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`Serving ${SITE_DIR} at ${url}`);
  if (openBrowser) {
    const cmd = process.platform === 'darwin' ? `open ${url}`
              : process.platform === 'win32'  ? `start ${url}`
              : `xdg-open ${url}`;
    exec(cmd);
  }
});
