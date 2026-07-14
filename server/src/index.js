import { createApp } from './app.js';

const PORT = process.env.PORT ?? 3003;

createApp().listen(PORT, () => {
  console.log(`[server] umbra API listening on http://localhost:${PORT}`);
});
