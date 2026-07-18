/**
 * Media-link resolver for share-page URLs.
 *
 * GET /api/resolve?url=<page-url>
 *
 * Social share links (Reels, TikTok posts, X statuses, ...) point at HTML
 * pages with the media embedded inside. This endpoint fetches the page —
 * behind the same SSRF validation and DNS pinning as /api/fetch — and
 * extracts the direct media URL from its markup (Open Graph / JSON-LD /
 * <video>/<audio> tags / platform JSON blobs).
 *
 * It returns a URL only, never media bytes: the client downloads the
 * resolved URL through its normal path (direct fetch, then /api/fetch,
 * which re-runs its own SSRF validation).
 *
 * Success:  200 { ok: true, mediaUrl, kind: 'video'|'audio'|'direct', pageTitle, source }
 * Failure:  4xx/5xx { ok: false, error, code } where code is one of
 *           UNSUPPORTED_PLATFORM | LOGIN_WALL | UPSTREAM_BLOCKED |
 *           STREAM_MANIFEST_ONLY | NO_MEDIA_FOUND | UPSTREAM_ERROR
 */
import {
  MAX_REDIRECTS,
  setSecurityHeaders,
  validateTarget,
  pinnedRequest
} from './_lib/security.js';

const MAX_HTML_BYTES = 3 * 1024 * 1024;   // og/JSON-LD live in <head>; cap page buffering
const PAGE_CONNECT_TIMEOUT_MS = 8_000;
const PAGE_BODY_DEADLINE_MS = 12_000;
const MAX_TITLE_LENGTH = 300;

// Most platforms server-render og:video for link-preview crawlers but not
// for unknown agents, so the crawler UA goes first; a browser UA is the
// second (and last) attempt.
const CRAWLER_USER_AGENT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const ERROR_MESSAGES = {
  UNSUPPORTED_PLATFORM: 'YouTube streams cannot be extracted',
  LOGIN_WALL: 'The page requires login to view',
  UPSTREAM_BLOCKED: 'The platform refused the request',
  STREAM_MANIFEST_ONLY: 'The page only exposes a streaming manifest',
  NO_MEDIA_FOUND: 'No direct media link found on the page',
  UPSTREAM_ERROR: 'The page could not be fetched'
};

const ERROR_STATUS = {
  UNSUPPORTED_PLATFORM: 422,
  LOGIN_WALL: 403,
  UPSTREAM_BLOCKED: 403,
  STREAM_MANIFEST_ONLY: 422,
  NO_MEDIA_FOUND: 422,
  UPSTREAM_ERROR: 502
};

// When both UA attempts fail, report the most informative failure.
const FAILURE_RANK = {
  LOGIN_WALL: 4,
  UPSTREAM_BLOCKED: 3,
  STREAM_MANIFEST_ONLY: 2,
  NO_MEDIA_FOUND: 1,
  UPSTREAM_ERROR: 0
};

export function isYouTubeHost(hostname) {
  const host = (hostname || '').toLowerCase().replace(/\.$/, '');
  return host === 'youtu.be' ||
    host === 'youtube.com' || host.endsWith('.youtube.com') ||
    host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');
}

function safeFromCodePoint(codePoint) {
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return '';
  }
}

/**
 * Single-pass decode of the entities that actually appear in attribute
 * values and titles (`&amp;` inside query strings is the common killer).
 */
export function decodeHTMLEntities(text) {
  if (!text) return text || '';
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

/** Parse the attributes of a single HTML tag, order-independently. */
function parseAttributes(tag) {
  const attrs = {};
  const attrRe = /([a-zA-Z][a-zA-Z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = attrRe.exec(tag)) !== null) {
    const name = match[1].toLowerCase();
    if (!(name in attrs)) {
      attrs[name] = match[2] ?? match[3] ?? match[4] ?? '';
    }
  }
  return attrs;
}

/** Collect <meta> property/name → content, first occurrence wins. */
function collectMetaTags(html) {
  const meta = {};
  const metaRe = /<meta\b[^>]*>/gi;
  let match;
  while ((match = metaRe.exec(html)) !== null) {
    const attrs = parseAttributes(match[0]);
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) {
      meta[key] = attrs.content;
    }
  }
  return meta;
}

// Real-world JSON-LD nests shallowly; the cap only guards against
// pathological payloads blowing the stack in the serverless function.
const MAX_JSONLD_DEPTH = 32;

/** Recursively collect VideoObject/AudioObject contentUrl from JSON-LD data. */
function collectJSONLDMedia(node, out, seen = new Set(), depth = 0) {
  if (depth > MAX_JSONLD_DEPTH) return;
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) collectJSONLDMedia(item, out, seen, depth + 1);
    return;
  }
  const rawType = node['@type'];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  if (types.includes('VideoObject') || types.includes('AudioObject')) {
    if (typeof node.contentUrl === 'string' && node.contentUrl) {
      out.push({
        url: node.contentUrl,
        kind: types.includes('AudioObject') ? 'audio' : 'video',
        source: 'json-ld'
      });
    }
  }
  for (const key of Object.keys(node)) {
    collectJSONLDMedia(node[key], out, seen, depth + 1);
  }
}

function unescapeJSONString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return null;
  }
}

function extractPageTitle(html, meta) {
  let title = meta['og:title'];
  if (!title) {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (match) title = match[1];
  }
  if (!title) return null;
  title = decodeHTMLEntities(title)
    .replace(/\s+/g, ' ')
    .trim()
    // Drop trailing platform branding ("… | TikTok", "… - on Instagram")
    .replace(/\s*[|\-–—•]\s*(on\s+)?(Instagram|TikTok|Twitter|Facebook|Vimeo|YouTube|X)\b.*$/i, '')
    .trim();
  return title ? title.slice(0, MAX_TITLE_LENGTH) : null;
}

function isStreamManifestURL(urlString) {
  try {
    const pathname = new URL(urlString).pathname.toLowerCase();
    return pathname.endsWith('.m3u8') || pathname.endsWith('.mpd');
  } catch {
    return false;
  }
}

function normalizeCandidate(raw, baseURL) {
  if (!raw) return null;
  const decoded = decodeHTMLEntities(String(raw).trim());
  let absolute;
  try {
    absolute = new URL(decoded, baseURL);
  } catch {
    return null;
  }
  if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') return null;
  return absolute.toString();
}

/**
 * Extract the best direct-media candidate from an HTML document.
 * Pure function (exported for unit tests).
 *
 * Returns { mediaUrl, kind, source, pageTitle, sawManifestOnly, loginTitle }
 * where mediaUrl is null when nothing usable was found.
 */
export function extractMediaFromHTML(html, baseURL) {
  const meta = collectMetaTags(html);
  const candidates = [];

  // 1. Open Graph / Twitter meta, in strict priority order
  const metaPriority = [
    ['og:video:secure_url', 'video'],
    ['og:video:url', 'video'],
    ['og:video', 'video'],
    ['og:audio:secure_url', 'audio'],
    ['og:audio:url', 'audio'],
    ['og:audio', 'audio'],
    ['twitter:player:stream', 'video']
  ];
  for (const [key, kind] of metaPriority) {
    if (meta[key]) candidates.push({ url: meta[key], kind, source: key });
  }

  // 2. JSON-LD VideoObject/AudioObject contentUrl (handles @graph nesting)
  const jsonLdRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  while ((jsonLdMatch = jsonLdRe.exec(html)) !== null) {
    try {
      collectJSONLDMedia(JSON.parse(jsonLdMatch[1]), candidates);
    } catch {
      // Malformed JSON-LD block — skip
    }
  }

  // 3. <video>/<audio> src attributes and their nested <source> tags
  const mediaTagRe = /<(video|audio)\b[^>]*>/gi;
  let tagMatch;
  while ((tagMatch = mediaTagRe.exec(html)) !== null) {
    const kind = tagMatch[1].toLowerCase();
    const attrs = parseAttributes(tagMatch[0]);
    if (attrs.src) candidates.push({ url: attrs.src, kind, source: `${kind}-tag` });
  }
  const mediaBlockRe = /<(video|audio)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let blockMatch;
  while ((blockMatch = mediaBlockRe.exec(html)) !== null) {
    const kind = blockMatch[1].toLowerCase();
    const sourceRe = /<source\b[^>]*>/gi;
    let sourceMatch;
    while ((sourceMatch = sourceRe.exec(blockMatch[2])) !== null) {
      const attrs = parseAttributes(sourceMatch[0]);
      if (attrs.src) candidates.push({ url: attrs.src, kind, source: `${kind}-source` });
    }
  }

  // 4. Cheap platform JSON blobs (TikTok playAddr, embedded player configs)
  const jsonUrlPatterns = [
    [/"contentUrl"\s*:\s*"((?:[^"\\]|\\.)+)"/g, 'json-contentUrl'],
    [/"playAddr"\s*:\s*"((?:[^"\\]|\\.)+)"/g, 'json-playAddr']
  ];
  for (const [pattern, source] of jsonUrlPatterns) {
    let jsonMatch;
    while ((jsonMatch = pattern.exec(html)) !== null) {
      const unescaped = unescapeJSONString(jsonMatch[1]);
      if (unescaped) candidates.push({ url: unescaped, kind: 'video', source });
    }
  }

  const pageTitle = extractPageTitle(html, meta);
  const loginTitle = pageTitle ? /^\s*(log\s*in|login|sign\s*in)\b/i.test(pageTitle) : false;

  let sawManifest = false;
  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate.url, baseURL);
    if (!normalized) continue;
    if (isStreamManifestURL(normalized)) {
      // HLS/DASH manifests can't be consumed as a single file by FFmpeg.wasm
      sawManifest = true;
      continue;
    }
    return {
      mediaUrl: normalized,
      kind: candidate.kind,
      source: candidate.source,
      pageTitle,
      sawManifestOnly: false,
      loginTitle
    };
  }

  return {
    mediaUrl: null,
    kind: null,
    source: null,
    pageTitle,
    sawManifestOnly: sawManifest,
    loginTitle
  };
}

function isHTMLContentType(contentType) {
  return /^(text\/html|application\/xhtml\+xml)/i.test(contentType);
}

function isMediaContentType(contentType) {
  return /^(audio|video)\//i.test(contentType) ||
    /^application\/(octet-stream|mp4)/i.test(contentType);
}

function isManifestContentType(contentType) {
  return /mpegurl|dash\+xml/i.test(contentType);
}

function looksLikeHTMLBuffer(buffer) {
  const head = buffer.subarray(0, 1024).toString('utf8');
  return /^\uFEFF?\s*(?:<!--[\s\S]*?-->\s*)*<(?:!doctype\s|html[\s>]|head[\s>]|body[\s>]|meta[\s>]|script[\s>]|title[\s>]|link[\s>]|div[\s>])/i.test(head);
}

/** Buffer a response body up to maxBytes / deadlineMs, returning what arrived. */
function readBody(response, maxBytes, deadlineMs) {
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    };

    const timer = setTimeout(() => {
      response.destroy();
      finish();
    }, deadlineMs);

    response.on('data', (chunk) => {
      total += chunk.length;
      chunks.push(chunk);
      if (total >= maxBytes) {
        response.destroy();
        finish();
      }
    });
    response.on('end', finish);
    response.on('close', finish);
    response.on('error', finish);
  });
}

function sendJSON(res, status, payload) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(status).json(payload);
}

function failure(code, detail) {
  return {
    ok: false,
    code,
    error: detail || ERROR_MESSAGES[code]
  };
}

/**
 * One resolution attempt with a given User-Agent.
 * Returns:
 *   null                → fatal validation error, response already sent
 *   { ok: true, ... }   → resolved
 *   { ok: false, ... }  → structured failure (caller may retry with another UA)
 */
async function attemptResolve(startURL, res, userAgent) {
  let target = new URL(startURL);
  let validation = await validateTarget(target, res);
  if (!validation) return null;

  let currentURL = target.toString();
  let response = null;

  for (let hops = 0; hops < MAX_REDIRECTS; hops++) {
    response = await pinnedRequest(currentURL, validation.ip, validation.family, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      connectTimeoutMs: PAGE_CONNECT_TIMEOUT_MS
    });

    const status = response.statusCode;
    if (status >= 300 && status < 400) {
      response.resume();

      const location = response.headers.location;
      if (!location) return failure('UPSTREAM_ERROR', 'Redirect without Location header');

      let redirectTarget;
      try {
        redirectTarget = new URL(location, currentURL);
      } catch {
        return failure('UPSTREAM_ERROR', 'Invalid redirect URL');
      }

      const redirectValidation = await validateTarget(redirectTarget, res);
      if (!redirectValidation) return null;

      currentURL = redirectTarget.toString();
      validation = redirectValidation;
      response = null;
      continue;
    }

    break;
  }

  if (!response) return failure('UPSTREAM_ERROR', 'Too many redirects');

  const status = response.statusCode;
  if (status === 401 || status === 403) {
    response.resume();
    response.destroy();
    return failure('UPSTREAM_BLOCKED');
  }
  if (status < 200 || status >= 300) {
    response.resume();
    response.destroy();
    return failure('UPSTREAM_ERROR', `Upstream request failed: HTTP ${status}`);
  }

  const contentType = response.headers['content-type'] || '';

  // The "page" is already a media file — the pasted link was direct after all
  if (isMediaContentType(contentType)) {
    response.resume();
    response.destroy();
    return { ok: true, mediaUrl: currentURL, kind: 'direct', pageTitle: null, source: 'content-type' };
  }
  if (isManifestContentType(contentType) || isStreamManifestURL(currentURL)) {
    response.resume();
    response.destroy();
    return failure('STREAM_MANIFEST_ONLY');
  }

  const body = await readBody(response, MAX_HTML_BYTES, PAGE_BODY_DEADLINE_MS);

  if (!isHTMLContentType(contentType) && !looksLikeHTMLBuffer(body)) {
    return { ok: true, mediaUrl: currentURL, kind: 'direct', pageTitle: null, source: 'sniff' };
  }

  const extraction = extractMediaFromHTML(body.toString('utf8'), currentURL);
  if (extraction.mediaUrl) {
    return {
      ok: true,
      mediaUrl: extraction.mediaUrl,
      kind: extraction.kind,
      pageTitle: extraction.pageTitle,
      source: extraction.source
    };
  }

  const finalPath = (() => {
    try {
      return new URL(currentURL).pathname.toLowerCase();
    } catch {
      return '';
    }
  })();
  if (extraction.loginTitle || /\/login\b|\/accounts\/login/.test(finalPath)) {
    return failure('LOGIN_WALL');
  }
  if (extraction.sawManifestOnly) {
    return failure('STREAM_MANIFEST_ONLY');
  }
  return failure('NO_MEDIA_FOUND');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    setSecurityHeaders(res);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const inputURL = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  if (!inputURL) {
    sendJSON(res, 400, { ok: false, error: 'Missing url query parameter', code: 'BAD_REQUEST' });
    return;
  }

  let target;
  try {
    target = new URL(inputURL);
  } catch {
    sendJSON(res, 400, { ok: false, error: 'Invalid URL format', code: 'BAD_REQUEST' });
    return;
  }

  if (isYouTubeHost(target.hostname)) {
    sendJSON(res, ERROR_STATUS.UNSUPPORTED_PLATFORM, failure('UNSUPPORTED_PLATFORM'));
    return;
  }

  const failures = [];
  try {
    for (const userAgent of [CRAWLER_USER_AGENT, BROWSER_USER_AGENT]) {
      let outcome;
      try {
        outcome = await attemptResolve(target.toString(), res, userAgent);
      } catch (error) {
        failures.push(failure('UPSTREAM_ERROR', `Page fetch failed: ${error.message}`));
        continue;
      }
      if (outcome === null) return; // validation error already sent
      if (outcome.ok) {
        sendJSON(res, 200, outcome);
        return;
      }
      failures.push(outcome);
    }

    // Both attempts failed — report the most informative failure
    failures.sort((a, b) => (FAILURE_RANK[b.code] ?? 0) - (FAILURE_RANK[a.code] ?? 0));
    const best = failures[0] || failure('UPSTREAM_ERROR');
    sendJSON(res, ERROR_STATUS[best.code] || 502, best);
  } catch (error) {
    if (!res.headersSent) {
      sendJSON(res, 502, failure('UPSTREAM_ERROR', `Resolve failed: ${error.message}`));
    }
  }
}
