const MAX_CONTENT_LENGTH = 2 * 1024 * 1024 * 1024; // 2 GB
const MAX_REDIRECTS = 5;

/**
 * Parse an IP address from a hostname string, handling IPv4, IPv6,
 * and IPv4-mapped IPv6 forms.
 * Returns null if the string is not an IP address.
 */
function parseIP(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '');

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  const mappedDotted = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mappedDotted) {
    return { version: 4, address: mappedDotted[1] };
  }

  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const a = (hi >> 8) & 0xff;
    const b = hi & 0xff;
    const c = (lo >> 8) & 0xff;
    const d = lo & 0xff;
    return { version: 4, address: `${a}.${b}.${c}.${d}` };
  }

  // Plain IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return { version: 4, address: normalized };
  }

  // IPv6 (contains ':')
  if (normalized.includes(':')) {
    return { version: 6, address: normalized.toLowerCase() };
  }

  return null;
}

/**
 * Check whether an IPv4 address falls in a private/reserved range.
 */
function isPrivateIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => p < 0 || p > 255 || !Number.isFinite(p))) {
    return true; // Malformed — treat as blocked
  }
  const [a, b] = parts;

  if (a === 127) return true;                               // Loopback
  if (a === 10) return true;                                 // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;          // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                   // 192.168.0.0/16
  if (a === 169 && b === 254) return true;                   // Link-local
  if (a === 0) return true;                                  // 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true;         // Shared address space (CGN)
  if (a === 198 && (b === 18 || b === 19)) return true;      // Benchmarking
  if (a >= 224) return true;                                 // Multicast + reserved
  return false;
}

/**
 * Check whether an IPv6 address falls in a private/reserved range.
 * Operates on the normalized lowercase string form.
 */
function isPrivateIPv6(address) {
  if (address === '::1' || address === '::') return true;              // Loopback / unspecified
  if (address.startsWith('fc') || address.startsWith('fd')) return true; // Unique local (ULA)
  if (address.startsWith('fe80')) return true;                           // Link-local
  if (address.startsWith('ff')) return true;                             // Multicast
  // IPv4-mapped should already be caught by parseIP, but guard here too
  if (address.startsWith('::ffff:')) return true;
  return false;
}

/**
 * Comprehensive private-host detection covering hostnames and all IP forms.
 */
function isPrivateHost(hostname) {
  if (!hostname) return true;

  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (normalized === 'localhost') return true;

  const ip = parseIP(normalized);
  if (ip) {
    return ip.version === 4 ? isPrivateIPv4(ip.address) : isPrivateIPv6(ip.address);
  }

  // Not an IP literal — will be checked after DNS resolution
  return false;
}

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
}

/**
 * Validate a URL target against SSRF protections.
 * Checks both hostname and resolved IP address.
 */
async function validateTarget(target, res) {
  if (!['http:', 'https:'].includes(target.protocol)) {
    setSecurityHeaders(res);
    res.status(400).json({ error: 'Only HTTP(S) URLs are supported' });
    return false;
  }

  if (isPrivateHost(target.hostname)) {
    setSecurityHeaders(res);
    res.status(403).json({ error: 'Private network addresses are not allowed' });
    return false;
  }

  // Resolve DNS to guard against hostnames that map to private IPs
  const ip = parseIP(target.hostname);
  if (!ip) {
    // It's a hostname — resolve it
    try {
      const { resolve4, resolve6 } = await import('node:dns/promises');

      let resolved = false;
      try {
        const ipv4Addrs = await resolve4(target.hostname);
        for (const addr of ipv4Addrs) {
          if (isPrivateIPv4(addr)) {
            setSecurityHeaders(res);
            res.status(403).json({ error: 'Private network addresses are not allowed' });
            return false;
          }
          resolved = true;
        }
      } catch {
        // No A record; try AAAA below
      }

      try {
        const ipv6Addrs = await resolve6(target.hostname);
        for (const addr of ipv6Addrs) {
          if (isPrivateIPv6(addr.toLowerCase())) {
            setSecurityHeaders(res);
            res.status(403).json({ error: 'Private network addresses are not allowed' });
            return false;
          }
          resolved = true;
        }
      } catch {
        // No AAAA record
      }

      if (!resolved) {
        setSecurityHeaders(res);
        res.status(400).json({ error: `Could not resolve hostname: ${target.hostname}` });
        return false;
      }
    } catch (e) {
      setSecurityHeaders(res);
      res.status(400).json({ error: `Could not resolve hostname: ${target.hostname}` });
      return false;
    }
  }

  return true;
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

  const allowed = await validateTarget(target, res);
  if (!allowed) return;

  try {
    // Follow redirects manually to re-validate each hop against SSRF
    let currentURL = target.toString();
    let response;

    for (let hops = 0; hops < MAX_REDIRECTS; hops++) {
      response = await fetch(currentURL, {
        redirect: 'manual',
        headers: {
          'User-Agent': 'reSOURCERY/2.3 (+https://resourcery.app)'
        }
      });

      const status = response.status;
      if (status >= 300 && status < 400) {
        const location = response.headers.get('location');
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

        const redirectAllowed = await validateTarget(redirectTarget, res);
        if (!redirectAllowed) return;

        currentURL = redirectTarget.toString();
        continue;
      }

      break;
    }

    if (!response || (response.status >= 300 && response.status < 400)) {
      setSecurityHeaders(res);
      res.status(502).json({ error: 'Too many redirects' });
      return;
    }

    if (!response.ok) {
      setSecurityHeaders(res);
      res.status(response.status).json({ error: `Upstream request failed: HTTP ${response.status}` });
      return;
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_CONTENT_LENGTH) {
      setSecurityHeaders(res);
      res.status(413).json({ error: 'Remote file exceeds 2 GB limit' });
      return;
    }

    setSecurityHeaders(res);
    const upstreamType = response.headers.get('content-type');
    if (upstreamType) {
      res.setHeader('Content-Type', upstreamType);
    }
    if (contentLength > 0) {
      res.setHeader('Content-Length', String(contentLength));
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Stream the response body instead of buffering into memory
    if (response.body) {
      const { Readable } = await import('node:stream');
      const { pipeline } = await import('node:stream/promises');
      res.status(200);
      await pipeline(Readable.fromWeb(response.body), res);
    } else {
      res.status(200).end();
    }
  } catch (error) {
    setSecurityHeaders(res);
    res.status(502).json({ error: `Proxy request failed: ${error.message}` });
  }
}
