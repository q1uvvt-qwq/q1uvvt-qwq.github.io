'use strict';
// Local preview only; GitHub Pages serves these files directly after upload.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 4177);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
	'.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
	'.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.xmind': 'application/octet-stream' };
const server = http.createServer(function (req, res) {
	let file;
	try {
		const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
		if (pathname.split('/').some(part => ['.git', '.agents', '.codex', '.aws', '.env'].includes(part))) throw new Error('Private path');
		file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
		if (!file.startsWith(root + path.sep)) throw new Error('Outside site');
	} catch (_) { res.writeHead(400); res.end('Invalid path'); return; }
	fs.stat(file, function (error, stat) {
		if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
		res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
			'Cache-Control': 'no-store', 'Content-Length': stat.size });
		if (req.method === 'HEAD') res.end();
		else fs.createReadStream(file).pipe(res);
	});
});
server.listen(port, '127.0.0.1', function () { console.log('Preview: http://127.0.0.1:' + port + '/#maps'); });
