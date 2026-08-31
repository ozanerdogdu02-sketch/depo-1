import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.E2E_PORT || 4200);
const root = join(process.cwd(), 'dist');
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

await stat(join(root, 'index.html'));

const server = createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url, `http://localhost:${port}`).pathname);
    const relativePath = normalize(requestPath).replace(/^[/\\]+/, '');
    let filePath = join(root, relativePath || 'index.html');

    if (!filePath.startsWith(root)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    try {
      if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html');
    } catch {
      filePath = join(root, 'index.html');
    }

    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream' });
    response.end(body);
  } catch (error) {
    response.writeHead(500).end(error.message);
  }
});

server.listen(port, '127.0.0.1');

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
