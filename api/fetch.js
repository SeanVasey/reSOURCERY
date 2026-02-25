const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^::1$/,
 /^fc/i,
 /^fd/i
];

const MAX_CONTENT_LENGTH = 2 * 1024 * 1024 * 1024; // 2 GB

function isPrivateHost(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '');
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(normalized));
}

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    setSecurityHeaders(res);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const inputURL = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  if (!inputURL) {
    setSecurityHeaders(res);
    res.status(400).json({ error: 'Missing url query parameter' });
    return;
  }

  let target;
  try {
    target = new URL(inputURL);
  } catch {
    setSecurityHeaders(res);
    res.status(400).json({ error: 'Invalid URL format' });
    return;
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    setSecurityHeaders(res);
    res.status(400).json({ error: 'Only HTTP(S) URLs are supported' });
    return;
  }

  if (isPrivateHost(target.hostname)) {
    setSecurityHeaders(res);
    res.status(403).json({ error: 'Private network addresses are not allowed' });
    return;
  }

  try {
    const upstream = await fetch(target.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent': 'reSOURCERY/2.3 (+https://resourcery.app)'
      }
    });

    if (!upstream.ok) {
      setSecurityHeaders(res);
      res.status(upstream.status).json({ error: `Upstream request failed: HTTP ${upstream.status}` });
      return;
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (contentLength > MAX_CONTENT_LENGTH) {
      setSecurityHeaders(res);
      res.status(413).json({ error: 'Remote file exceeds 2 GB limit' });
      return;
    }

    setSecurityHeaders(res);
    const upstreamType = upstream.headers.get('content-type');
    if (upstreamType) {
      res.setHeader('Content-Type', upstreamType);
    }
    if (contentLength > 0) {
      res.setHeader('Content-Length', String(contentLength));
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    const arrayBuffer = await upstream.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_CONTENT_LENGTH) {
      res.status(413).json({ error: 'Remote file exceeds 2 GB limit' });
      return;
    }

    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    setSecurityHeaders(res);
    res.status(502).json({ error: `Proxy request failed: ${error.message}` });
  }
}

