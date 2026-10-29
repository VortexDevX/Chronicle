import http from 'node:http';
import { URL } from 'node:url';

const PORT = process.env.PORT || 5050;
const PROXY_KEY = process.env.CHRONICLE_PROXY_KEY;

if (!PROXY_KEY) {
  console.error("Missing CHRONICLE_PROXY_KEY environment variable.");
  process.exit(1);
}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://www.google.com/',
};

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || 'localhost';
  const reqUrl = new URL(req.url, 'http://' + host);

  // Health check
  if (req.method === 'GET' && (reqUrl.pathname === '/health' || reqUrl.pathname === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: Math.round(process.uptime()) }));
    return;
  }

  // Auth check
  const authHeader = req.headers['x-chronicle-proxy-key'];
  if (!authHeader || authHeader !== PROXY_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  if (reqUrl.pathname === '/scrape') {
    let targetUrl = '';
    let method = 'GET';
    let customHeaders = {};
    let reqBody = undefined;

    if (req.method === 'GET') {
      targetUrl = reqUrl.searchParams.get('url') || '';
    } else if (req.method === 'POST') {
      try {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        targetUrl = parsed.url;
        method = parsed.method || 'GET';
        customHeaders = parsed.headers || {};
        reqBody = parsed.body;
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_json_body' }));
        return;
      }
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }

    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing_or_invalid_url' }));
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);

    try {
      const mergedHeaders = {
        ...DEFAULT_HEADERS,
        ...customHeaders,
      };

      const fetchRes = await fetch(targetUrl, {
        method,
        headers: mergedHeaders,
        body: reqBody,
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const text = await fetchRes.text();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: fetchRes.ok,
        status: fetchRes.status,
        statusText: fetchRes.statusText,
        resolvedUrl: fetchRes.url,
        body: text,
      }));
    } catch (fetchErr) {
      clearTimeout(timeout);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'upstream_fetch_failed',
        message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Chronicle Scraper Proxy listening on 127.0.0.1:' + PORT);
});
