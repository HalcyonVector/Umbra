import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import issRouter from './routes/iss.js';
import astrosRouter from './routes/astros.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');

// Split from index.js so tests can import the Express app directly
// (via supertest) without binding a real port.
export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/iss', issRouter);
  app.use('/api/astros', astrosRouter);

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // In production, serve the built client (npm run build) as static assets.
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => {
      if (err) next();
    });
  });

  return app;
}
