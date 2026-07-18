/**
 * Hardened URL proxy for CORS fallback. Streams remote media through the
 * app origin after SSRF validation (private-IP blocking, DNS pinning,
 * per-redirect re-validation) — see api/_lib/security.js for the shared
 * validation/pinning helpers.
 */
import {
  MAX_CONTENT_LENGTH,
  MAX_REDIRECTS,
  STREAM_IDLE_TIMEOUT_MS,
  MAX_STREAM_TIME_MS,
  setSecurityHeaders,
  validateTarget,
  pinnedRequest
} from './_lib/security.js';

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

  const validation = await validateTarget(target, res);
  if (!validation) return;

  let pinnedIP = validation.ip;
  let pinnedFamily = validation.family;

  try {
    const { pipeline } = await import('node:stream/promises');
    let currentURL = target.toString();
    let response;

    for (let hops = 0; hops < MAX_REDIRECTS; hops++) {
      response = await pinnedRequest(currentURL, pinnedIP, pinnedFamily);

      const status = response.statusCode;
      if (status >= 300 && status < 400) {
        response.resume(); // drain body to free socket

        const location = response.headers.location;
        if (!location) {
          setSecurityHeaders(res);
          res.status(502).json({ error: 'Redirect without Location header' });
          return;
        }

        let redirectTarget;
        try {
          redirectTarget = new URL(location, currentURL);
        } catch {
          setSecurityHeaders(res);
          res.status(502).json({ error: 'Invalid redirect URL' });
          return;
        }

        const redirectValidation = await validateTarget(redirectTarget, res);
        if (!redirectValidation) return;

        currentURL = redirectTarget.toString();
        pinnedIP = redirectValidation.ip;
        pinnedFamily = redirectValidation.family;
        continue;
      }

      break;
    }

    if (!response || (response.statusCode >= 300 && response.statusCode < 400)) {
      setSecurityHeaders(res);
      res.status(502).json({ error: 'Too many redirects' });
      return;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.resume();
      setSecurityHeaders(res);
      res.status(response.statusCode).json({ error: `Upstream request failed: HTTP ${response.statusCode}` });
      return;
    }

    const contentLength = Number(response.headers['content-length'] || 0);
    if (contentLength > MAX_CONTENT_LENGTH) {
      response.resume();
      setSecurityHeaders(res);
      res.status(413).json({ error: 'Remote file exceeds 2 GB limit' });
      return;
    }

    setSecurityHeaders(res);
    const upstreamType = response.headers['content-type'];
    if (upstreamType) {
      res.setHeader('Content-Type', upstreamType);
    }
    if (contentLength > 0) {
      res.setHeader('Content-Length', String(contentLength));
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Stream with timeout protection against indefinite connections (#28)
    res.status(200);

    const streamTimer = setTimeout(() => {
      response.destroy(new Error('Maximum streaming time exceeded'));
    }, MAX_STREAM_TIME_MS);

    response.setTimeout(STREAM_IDLE_TIMEOUT_MS, () => {
      response.destroy(new Error('Stream idle timeout'));
    });

    try {
      await pipeline(response, res);
    } finally {
      clearTimeout(streamTimer);
    }
  } catch (error) {
    if (!res.headersSent) {
      setSecurityHeaders(res);
      res.status(502).json({ error: `Proxy request failed: ${error.message}` });
    }
  }
}
