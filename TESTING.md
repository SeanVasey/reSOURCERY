# Proxy Server Testing

## Purpose
This document describes how to test the reSOURCERY proxy server.

## Server Details
- **Port**: 50910
- **Host**: 127.0.0.1 (localhost)
- **Implementation**: Python SimpleHTTPServer with CORS headers

## Testing

### Basic Test (HTTP HEAD Request)
```bash
curl -I http://127.0.0.1:50910/
```

**Expected Response:**
```
HTTP/1.0 200 OK
Server: SimpleHTTP/0.6 Python/3.x.x
Content-type: text/html
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

### Full Test (HTTP GET Request)
```bash
curl http://127.0.0.1:50910/
```

**Expected Response:**
The HTML content of index.html starting with:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  ...
```

### Browser Test
1. Start the server: `./start-server.sh`
2. Open browser to: http://127.0.0.1:50910/
3. Verify the reSOURCERY PWA loads correctly

## Running the Server

### Prerequisites
Ensure the start script is executable (only needed on first use):
```bash
chmod +x start-server.sh
```

### Method 1: Using the start script
```bash
./start-server.sh
```

### Method 2: Direct Python execution
```bash
python3 server.py
```

## Features
- Serves static files from the project directory
- Adds Cross-Origin headers for SharedArrayBuffer support (required by FFmpeg.wasm)
- Simple, lightweight, ideal for local development
- Graceful shutdown with Ctrl+C


### Proxy Endpoint Test (URL Fallback)
```bash
curl -I "http://127.0.0.1:50910/api/fetch?url=https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
```

**Expected Response:**
- `HTTP/1.0 200 OK`
- `Access-Control-Allow-Origin: *`
- `Content-Type` from upstream resource

### Proxy Security Guardrail Test
```bash
curl "http://127.0.0.1:50910/api/fetch?url=http://127.0.0.1:50910/"
```

**Expected Response:**
- JSON payload with `Private network addresses are not allowed`
- HTTP status `403`
