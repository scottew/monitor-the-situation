'use strict';
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const PUBLIC_FILES = new Set(['index.html', 'style.css', 'app.js', 'camera-utils.js', 'state-config.js', 'favicon.svg']);
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };
function publicPath(value) {
  return !value.split('/').some(part => part.startsWith('.') || part === '') &&
    (PUBLIC_FILES.has(value) || (value.startsWith('vendor/') && Object.hasOwn(TYPES, path.extname(value))));
}
function createLocalServer({ root, allowRemote = false, cameras, udot, camnames }) {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    const fail = (code, text) => { res.writeHead(code, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}); res.end(text); };
    try {
      const host = new URL(`http://${req.headers.host || ''}`);
      if (!allowRemote && !['localhost','127.0.0.1','[::1]'].includes(host.hostname)) return fail(421,'Invalid host');
      // No wildcard CORS. Block cross-site requests, including DNS-rebinding origins.
      if (req.headers['sec-fetch-site'] === 'cross-site') return fail(403,'Cross-site request denied');
      if (req.headers.origin && req.headers.origin !== host.origin) return fail(403,'Cross-origin request denied');
      if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); return fail(405,'Method not allowed'); }
      const parsed = new URL(req.url, host.origin);
      if (parsed.origin !== host.origin) return fail(400,'Invalid request target');
      const pathname = decodeURIComponent(parsed.pathname);
      if (pathname === '/api/cameras' || pathname === '/api/camnames' || pathname.startsWith('/api/proxy/') || pathname.startsWith('/proxy/')) {
        if (req.method !== 'GET') return fail(405,'Method not allowed');
        req.query = Object.fromEntries(parsed.searchParams);
        if (pathname === '/api/cameras') return await cameras(req,res);
        if (pathname === '/api/camnames') return await camnames(req,res);
        req.query.p = pathname.replace(/^\/(api\/)?proxy/, '');
        return await udot(req,res);
      }
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (!publicPath(relative)) return fail(404,'Not found');
      const realRoot = await fs.realpath(root);
      const candidate = path.resolve(realRoot,relative);
      if (!candidate.startsWith(realRoot + path.sep)) return fail(404,'Not found');
      const actual = await fs.realpath(candidate);
      // Symlinks cannot smuggle repository or external files through a public name.
      if (actual !== candidate || !(await fs.stat(actual)).isFile()) return fail(404,'Not found');
      const data = await fs.readFile(actual);
      res.writeHead(200, {'Content-Type':TYPES[path.extname(relative)],'Content-Length':data.length});
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (_) { if (!res.headersSent) fail(404,'Not found'); else res.destroy(); }
  });
}
module.exports = { createLocalServer, publicPath };
