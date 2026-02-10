const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3001;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer({
    maxHeaderSize: 32768, // 32KB pour gérer les en-têtes plus volumineux
  }, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      
      // Vérifier si l'URL contient des données base64 (ne devrait jamais arriver)
      if (req.url && req.url.includes('data:image')) {
        console.warn('⚠️  URL contient des données base64 - cela ne devrait pas arriver:', req.url.substring(0, 100));
        res.statusCode = 400;
        res.end('Bad Request: URL contains image data');
        return;
      }
      
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
