// Unit tests for the pure extraction helpers in api/resolve.js.
// Run: node tests/resolve-extract.test.mjs
import assert from 'node:assert';
import { extractMediaFromHTML, decodeHTMLEntities, isYouTubeHost } from '../api/resolve.js';

const BASE = 'https://example.com/watch/abc/';

// og:video:secure_url wins over lower-priority sources present on the page
{
  const html = `
    <html><head>
      <meta property="og:video:secure_url" content="https://cdn.example.com/secure.mp4">
      <meta property="og:video" content="https://cdn.example.com/plain.mp4">
      <meta property="twitter:player:stream" content="https://cdn.example.com/tw.mp4">
    </head><body><video src="https://cdn.example.com/tag.mp4"></video></body></html>`;
  const result = extractMediaFromHTML(html, BASE);
  assert.strictEqual(result.mediaUrl, 'https://cdn.example.com/secure.mp4');
  assert.strictEqual(result.kind, 'video');
  assert.strictEqual(result.source, 'og:video:secure_url');
}

// Attribute order must not matter (content before property)
{
  const html = `<meta content="https://cdn.example.com/swapped.mp4" property="og:video">`;
  const result = extractMediaFromHTML(html, BASE);
  assert.strictEqual(result.mediaUrl, 'https://cdn.example.com/swapped.mp4');
}

// HTML entities in attribute URLs are decoded (&amp; in query strings)
{
  const html = `<meta property="og:video" content="https://cdn.example.com/v.mp4?a=1&amp;b=2">`;
  const result = extractMediaFromHTML(html, BASE);
  assert.strictEqual(result.mediaUrl, 'https://cdn.example.com/v.mp4?a=1&b=2');
}

// Relative <source> URLs absolutize against the final page URL
{
  const html = `<video controls><source src="../media/clip.webm" type="video/webm"></video>`;
  const result = extractMediaFromHTML(html, BASE);
  assert.strictEqual(result.mediaUrl, 'https://example.com/watch/media/clip.webm');
  assert.strictEqual(result.kind, 'video');
}

// JSON-LD VideoObject inside @graph
{
  const html = `
    <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebPage","name":"x"},
        {"@type":"VideoObject","contentUrl":"https://cdn.example.com/ld.mp4","embedUrl":"https://example.com/embed/1"}
      ]}
    </script>`;
  const result = extractMediaFromHTML(html, BASE);
  assert.strictEqual(result.mediaUrl, 'https://cdn.example.com/ld.mp4');
  assert.strictEqual(result.source, 'json-ld');
}

// AudioObject reports kind 'audio'; og:audio likewise
{
  const ld = `<script type="application/ld+json">{"@type":"AudioObject","contentUrl":"https://cdn.example.com/pod.mp3"}</script>`;
  assert.strictEqual(extractMediaFromHTML(ld, BASE).kind, 'audio');
  const og = `<meta property="og:audio" content="https://cdn.example.com/song.mp3">`;
  assert.strictEqual(extractMediaFromHTML(og, BASE).kind, 'audio');
}

// Escaped JSON blob URLs (playAddr) are unescaped: \/ and &
{
  const html = `<script>var data = {"playAddr":"https:\\/\\/v.example.com\\/play.mp4?tk=1\\u0026sig=2"};</script>`;
  const result = extractMediaFromHTML(html, BASE);
  assert.strictEqual(result.mediaUrl, 'https://v.example.com/play.mp4?tk=1&sig=2');
  assert.strictEqual(result.source, 'json-playAddr');
}

// Manifest-only pages are flagged, not returned as media
{
  const html = `<meta property="og:video" content="https://cdn.example.com/stream/master.m3u8">`;
  const result = extractMediaFromHTML(html, BASE);
  assert.strictEqual(result.mediaUrl, null);
  assert.strictEqual(result.sawManifestOnly, true);
}

// A manifest candidate falls through to the next usable candidate
{
  const html = `
    <meta property="og:video" content="https://cdn.example.com/stream/master.m3u8">
    <meta property="og:video:url" content="https://cdn.example.com/fallback.mp4">`;
  const result = extractMediaFromHTML(html, BASE);
  assert.strictEqual(result.mediaUrl, 'https://cdn.example.com/fallback.mp4', 'og:video:url outranks plain og:video');
  const html2 = `
    <meta property="og:video:secure_url" content="https://cdn.example.com/stream/master.m3u8">
    <meta property="og:video" content="https://cdn.example.com/fallback.mp4">`;
  const result2 = extractMediaFromHTML(html2, BASE);
  assert.strictEqual(result2.mediaUrl, 'https://cdn.example.com/fallback.mp4');
  assert.strictEqual(result2.sawManifestOnly, false);
}

// Login-wall pages are detected from the title
{
  const html = `<title>Log in to Instaface</title><body>content</body>`;
  const result = extractMediaFromHTML(html, BASE);
  assert.strictEqual(result.mediaUrl, null);
  assert.strictEqual(result.loginTitle, true);
}

// Plain article: no media, no login flag, title preserved
{
  const html = `<title>How wizards mix audio</title><p>words</p>`;
  const result = extractMediaFromHTML(html, BASE);
  assert.strictEqual(result.mediaUrl, null);
  assert.strictEqual(result.loginTitle, false);
  assert.strictEqual(result.sawManifestOnly, false);
  assert.strictEqual(result.pageTitle, 'How wizards mix audio');
}

// Trailing platform branding is stripped from titles; og:title preferred
{
  const html = `<title>Sunset Groove | TikTok - Make Your Day</title>`;
  assert.strictEqual(extractMediaFromHTML(html, BASE).pageTitle, 'Sunset Groove');
  const html2 = `<meta property="og:title" content="Night Drive - on Instagram"><title>ignored</title>`;
  assert.strictEqual(extractMediaFromHTML(html2, BASE).pageTitle, 'Night Drive');
  // "X" only strips as a word — not the start of another word
  const html3 = `<title>Track - Xylophone Mix</title>`;
  assert.strictEqual(extractMediaFromHTML(html3, BASE).pageTitle, 'Track - Xylophone Mix');
}

// Non-HTTP(S) and unparsable candidates are rejected
{
  const html = `
    <meta property="og:video" content="ftp://cdn.example.com/v.mp4">
    <meta property="og:video:url" content="javascript:alert(1)">`;
  assert.strictEqual(extractMediaFromHTML(html, BASE).mediaUrl, null);
}

// decodeHTMLEntities: named, decimal, hex
assert.strictEqual(decodeHTMLEntities('a &amp; b &lt;c&gt; &#39;d&#x27;'), "a & b <c> 'd'");
assert.strictEqual(decodeHTMLEntities(''), '');

// isYouTubeHost coverage
assert.strictEqual(isYouTubeHost('www.youtube.com'), true);
assert.strictEqual(isYouTubeHost('music.youtube.com'), true);
assert.strictEqual(isYouTubeHost('youtu.be'), true);
assert.strictEqual(isYouTubeHost('www.youtube-nocookie.com'), true);
assert.strictEqual(isYouTubeHost('notyoutube.com'), false);
assert.strictEqual(isYouTubeHost('example.com'), false);

console.log('resolve extraction helpers behave as expected');
