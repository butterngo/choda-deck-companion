import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOTAL = 30;
const INTERVAL_MS = 3000;

const app = new Hono();

app.get('/sse', (c) => {
  return streamSSE(c, async (stream) => {
    for (let seq = 0; seq < TOTAL; seq++) {
      await stream.writeSSE({
        event: 'tick',
        data: JSON.stringify({ seq, ts: Date.now() }),
        id: String(seq),
      });
      console.log(`[sse] emit seq=${seq}`);
      if (seq < TOTAL - 1) await stream.sleep(INTERVAL_MS);
    }
    await stream.writeSSE({
      event: 'done',
      data: JSON.stringify({ total: TOTAL }),
    });
    console.log(`[sse] complete — emitted ${TOTAL} events`);
  });
});

app.get('/client.html', async (c) => {
  const html = await readFile(join(__dirname, 'client.html'), 'utf8');
  return c.body(html, 200, { 'content-type': 'text/html; charset=utf-8' });
});

app.get('/', (c) => c.redirect('/client.html'));

serve({ fetch: app.fetch, port: 8989, hostname: '127.0.0.1' }, (info) => {
  console.log(`spike sse-windows listening on http://${info.address}:${info.port}`);
  console.log(`open http://127.0.0.1:8989/client.html in Chrome`);
});
