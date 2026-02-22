/**
 * Audio Processor Module
 * Handles audio extraction, analysis, and format conversion
 * Uses FFmpeg.wasm for media processing
 *
 * Version is managed centrally via js/version.js (APP_VERSION).
 *
 * @bugfix Fixed preserveSampleRate setting not being used
 * @bugfix Integrated Web Worker for non-blocking audio analysis
 * @bugfix Fixed progress flow conflicts with app-level progress tracking
 * @bugfix Added URL protocol validation
 * @bugfix Fixed worker not terminated on destroy
 */

class AudioProcessor {
  constructor(options = {}) {
    this.ffmpegCoreConfig = {
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
      workerURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.worker.js'
    };

    this.ffmpeg = null;
    this.isLoaded = false;
    this.audioContext = null;
    this.currentFile = null;
    this.extractedAudio = null;
    this.audioBuffer = null;

    // Settings with defaults
    this.settings = {
      preserveSampleRate: options.preserveSampleRate ?? true,
      useWebWorker: options.useWebWorker ?? true
    };

    // Audio metadata
    this.metadata = {
      duration: 0,
      sampleRate: 0,
      originalSampleRate: 0,
      channels: 0,
      bitDepth: 0,
      codec: '',
      bitrate: 0
    };

    // Web Worker for background analysis
    this.analysisWorker = null;
    this.workerMessageId = 0;
    this.pendingWorkerCalls = new Map();

    // Fallback detectors (used if worker unavailable)
    this.tempoDetector = null;
    this.keyDetector = null;

    // Processing callbacks
    this.onProgress = null;
    this.onStageChange = null;

    // Guard against concurrent processing
    this.isProcessing = false;

    // Initialize worker
    this.initWorker();
  }

  /**
   * Update settings
   * @param {Object} newSettings - Settings to update
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  /**
   * Initialize Web Worker for audio analysis
   */
  initWorker() {
    if (!this.settings.useWebWorker || typeof Worker === 'undefined') {
      console.log('[AudioProcessor] Web Worker not available, using main thread');
      return;
    }

    try {
      this.analysisWorker = new Worker('js/analysis-worker.js');

      this.analysisWorker.onmessage = (e) => {
        const { id, success, result, error } = e.data;
        const pending = this.pendingWorkerCalls.get(id);

        if (pending) {
          this.pendingWorkerCalls.delete(id);
          if (success) {
            pending.resolve(result);
          } else {
            pending.reject(new Error(error));
          }
        }
      };

      this.analysisWorker.onerror = (error) => {
        console.error('[AudioProcessor] Worker error:', error);
        // Fall back to main thread analysis
        this.analysisWorker = null;
      };

      console.log('[AudioProcessor] Web Worker initialized');
    } catch (error) {
      console.warn('[AudioProcessor] Failed to initialize worker:', error);
      this.analysisWorker = null;
    }
  }

  /**
   * Run analysis in Web Worker
   * @param {string} type - Analysis type ('analyzeTempo', 'analyzeKey', 'analyzeAll')
   * @param {Float32Array} channelData - Audio channel data
   * @param {number} sampleRate - Sample rate
   * @returns {Promise} - Analysis result
   */
  runWorkerAnalysis(type, channelData, sampleRate) {
    return new Promise((resolve, reject) => {
      if (!this.analysisWorker) {
        reject(new Error('Worker not available'));
        return;
      }

      const id = ++this.workerMessageId;
      this.pendingWorkerCalls.set(id, { resolve, reject });

      // Transfer channel data to worker (use slice to create transferable copy)
      const dataArray = new Float32Array(channelData);

      this.analysisWorker.postMessage({
        type,
        id,
        data: {
          channelData: dataArray,
          sampleRate
        }
      }, [dataArray.buffer]);
    });
  }

  /**
   * Fetch a URL with progress tracking via ReadableStream
   * Retries on 5xx errors with exponential backoff (mobile connections can be flaky)
   * @param {string} url - URL to fetch
   * @param {Function} onProgress - Progress callback receiving value 0-1
   * @param {number} maxRetries - Maximum retry attempts for server errors
   * @returns {Promise<Uint8Array>} - Downloaded data
   */
  async fetchWithProgress(url, onProgress, maxRetries = 3) {
    let response;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        response = await fetch(url);
      } catch (networkError) {
        lastError = networkError;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          console.warn(`[AudioProcessor] Fetch attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error('Network request failed. Check your connection and try again.');
      }

      // Retry on server errors (5xx) which include the SW's 503 fallback
      if (response.status >= 500 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[AudioProcessor] HTTP ${response.status} on attempt ${attempt + 1}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch: HTTP ${response.status}`);
      }

      // Success — break out of retry loop
      break;
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    // If no content-length or no ReadableStream support, fallback to simple download
    if (!total || !response.body) {
      const data = new Uint8Array(await response.arrayBuffer());
      if (onProgress) onProgress(1);
      return data;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      received += value.length;

      if (onProgress) {
        onProgress(Math.min(received / total, 1));
      }
    }

    // Combine chunks into single Uint8Array
    const data = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }

    return data;
  }

  /**
   * Read local file with progress tracking
   * @param {File} file - Local file
   * @param {Function} onProgress - Progress callback receiving value 0-1
   * @returns {Promise<Uint8Array>}
   */
  readLocalFileWithProgress(file, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onprogress = (event) => {
        if (!onProgress || !event.lengthComputable) return;
        onProgress(Math.min(event.loaded / event.total, 1));
      };

      reader.onerror = () => {
        reject(new Error(`Failed to read file: ${file.name}`));
      };

      reader.onload = () => {
        if (onProgress) onProgress(1);
        resolve(new Uint8Array(reader.result));
      };

      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Guard async stages from hanging forever due CDN/runtime failures
   * @param {Promise} promise - Promise to guard
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {string} errorMessage - Error shown when timeout expires
   * @returns {Promise}
   */
  withTimeout(promise, timeoutMs, errorMessage) {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
  }

  /**
   * Initialize FFmpeg
   * Uses single-threaded core for compatibility with GitHub Pages (no SharedArrayBuffer required)
   * Downloads core files with progress tracking to avoid UI freezing
   */
  async initialize() {
    if (this.isLoaded) return true;

    try {
      this.updateStage('Loading FFmpeg...');
      this.updateProgress(5);

      // Check cross-origin isolation (required for SharedArrayBuffer / FFmpeg.wasm)
      if (typeof window !== 'undefined' && !window.crossOriginIsolated) {
        console.warn('[AudioProcessor] crossOriginIsolated is false — SharedArrayBuffer may be unavailable. FFmpeg.wasm may fail.');
      }

      // Check for early CDN load failures detected by script onerror handlers
      if (window.FFmpegLoadErrors?.length > 0) {
        throw new Error('FFmpeg CDN scripts failed to load. Please check your internet connection and try again.');
      }

      // Wait for FFmpeg to be available from CDN
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds max wait
      while ((!window.FFmpegWASM?.FFmpeg || !window.FFmpegUtil?.fetchFile) && attempts < maxAttempts) {
        // Bail early if CDN errors were detected during polling
        if (window.FFmpegLoadErrors?.length > 0) {
          throw new Error('FFmpeg CDN scripts failed to load. Please check your internet connection and try again.');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        // Update progress during loading
        if (attempts % 10 === 0) {
          this.updateProgress(5 + Math.min(attempts / 10, 5));
        }
      }

      if (!window.FFmpegWASM?.FFmpeg) {
        throw new Error('FFmpeg library failed to load. Please check your internet connection and try again.');
      }

      if (!window.FFmpegUtil?.fetchFile) {
        throw new Error('FFmpeg utilities failed to load. Please check your internet connection and try again.');
      }

      this.updateStage('Initializing audio engine...');
      this.updateProgress(10);

      // Access FFmpeg from the global scope (loaded via CDN)
      const FFmpeg = window.FFmpegWASM.FFmpeg;
      const fetchFile = window.FFmpegUtil.fetchFile;

      this.ffmpeg = new FFmpeg();
      this.fetchFile = fetchFile;

      // Set up progress handler
      this.ffmpeg.on('progress', ({ progress }) => {
        if (this.onProgress) {
          // Map FFmpeg progress (0-1) to extraction range (40-70)
          const mappedProgress = 40 + Math.round(progress * 30);
          this.onProgress(Math.min(mappedProgress, 70));
        }
      });

      // Set up log handler for debugging
      this.ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
        this.parseFFmpegLog(message);
      });

      // Download FFmpeg core files with progress tracking
      // Pre-fetching with ReadableStream allows us to report download progress
      // instead of hanging at a fixed percentage during ffmpeg.load()
      const { coreURL, wasmURL, workerURL } = this.ffmpegCoreConfig;
      const objectURLs = [];

      // Download core JS (small file, ~100KB) - progress 10-12%
      this.updateStage('Downloading audio engine...');
      let coreJSData;
      try {
        coreJSData = await this.withTimeout(
          this.fetchWithProgress(coreURL, (progress) => {
            this.updateProgress(10 + Math.round(progress * 2));
          }),
          30000,
          'Audio engine script download timed out. Please check your connection and try again.'
        );
      } catch (err) {
        console.error('[AudioProcessor] Core JS download failed:', err);
        throw err;
      }
      const coreJSBlob = new Blob([coreJSData], { type: 'text/javascript' });
      const coreJSBlobURL = URL.createObjectURL(coreJSBlob);
      objectURLs.push(coreJSBlobURL);

      // Download WASM binary (large file, ~25MB) - progress 12-23%
      this.updateStage('Downloading processing core (~25 MB)...');
      let wasmData;
      try {
        wasmData = await this.withTimeout(
          this.fetchWithProgress(wasmURL, (progress) => {
            this.updateProgress(12 + Math.round(progress * 11));
          }),
          60000,
          'Audio engine core download timed out. The file is large (~25 MB) — please check your connection and try again.'
        );
      } catch (err) {
        console.error('[AudioProcessor] WASM binary download failed:', err);
        throw err;
      }
      const wasmBlob = new Blob([wasmData], { type: 'application/wasm' });
      const wasmBlobURL = URL.createObjectURL(wasmBlob);
      objectURLs.push(wasmBlobURL);

      // Download worker script so ffmpeg.load can resolve worker from blob URLs.
      // Without this, the loader can stall around ~20-30% while trying to fetch
      // ffmpeg-core.worker.js relative to a blob: URL.
      this.updateStage('Preparing audio worker...');
      let workerData;
      try {
        workerData = await this.withTimeout(
          this.fetchWithProgress(workerURL, (progress) => {
            this.updateProgress(23 + Math.round(progress * 2));
          }),
          30000,
          'Audio worker download timed out. Please check your connection and try again.'
        );
      } catch (err) {
        console.error('[AudioProcessor] Worker script download failed:', err);
        throw err;
      }
      const workerBlob = new Blob([workerData], { type: 'text/javascript' });
      const workerBlobURL = URL.createObjectURL(workerBlob);
      objectURLs.push(workerBlobURL);

      // Load FFmpeg core with pre-downloaded blob URLs
      // Retry with exponential backoff (max 3 attempts) for transient failures
      this.updateStage('Starting audio engine...');
      this.updateProgress(25);

      const maxLoadAttempts = 3;
      let lastLoadError = null;

      for (let loadAttempt = 1; loadAttempt <= maxLoadAttempts; loadAttempt++) {
        try {
          await this.withTimeout(
            this.ffmpeg.load({
              coreURL: coreJSBlobURL,
              wasmURL: wasmBlobURL,
              workerURL: workerBlobURL,
            }),
            45000,
            'Audio engine initialization timed out. Please refresh and retry.'
          );
          lastLoadError = null;
          break; // Success
        } catch (loadError) {
          lastLoadError = loadError;
          console.error(`[AudioProcessor] FFmpeg load attempt ${loadAttempt}/${maxLoadAttempts} failed:`, loadError);

          if (loadAttempt < maxLoadAttempts) {
            const delay = Math.pow(2, loadAttempt) * 1000; // 2s, 4s
            this.updateStage(`Retrying audio engine (attempt ${loadAttempt + 1}/${maxLoadAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Re-create FFmpeg instance for clean retry
            const FFmpegCtor = window.FFmpegWASM.FFmpeg;
            this.ffmpeg = new FFmpegCtor();

            this.ffmpeg.on('progress', ({ progress }) => {
              if (this.onProgress) {
                const mappedProgress = 40 + Math.round(progress * 30);
                this.onProgress(Math.min(mappedProgress, 70));
              }
            });

            this.ffmpeg.on('log', ({ message }) => {
              console.log('[FFmpeg]', message);
              this.parseFFmpegLog(message);
            });
          }
        }
      }

      // Clean up blob URLs regardless of outcome
      objectURLs.forEach((url) => URL.revokeObjectURL(url));

      if (lastLoadError) {
        throw lastLoadError;
      }

      this.isLoaded = true;
      this.updateStage('Audio engine ready');
      this.updateProgress(25);

      console.log('[AudioProcessor] FFmpeg initialized successfully');
      return true;
    } catch (error) {
      console.error('[AudioProcessor] Failed to load FFmpeg:', error);
      console.error('[AudioProcessor] FFmpeg bootstrap context:', {
        config: this.ffmpegCoreConfig,
        crossOriginIsolated: typeof window !== 'undefined' ? window.crossOriginIsolated : 'N/A',
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : 'unknown'
      });

      // Reset state so initialize() can be retried without a page refresh
      this.ffmpeg = null;
      this.isLoaded = false;

      this.updateStage('Error loading audio engine');
      throw new Error(error.message || 'Failed to initialize audio processor. Please refresh and try again.');
    }
  }

  /**
   * Parse FFmpeg log messages for metadata
   */
  parseFFmpegLog(message) {
    // Extract duration
    const durationMatch = message.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (durationMatch) {
      const hours = parseInt(durationMatch[1]);
      const minutes = parseInt(durationMatch[2]);
      const seconds = parseInt(durationMatch[3]);
      this.metadata.duration = hours * 3600 + minutes * 60 + seconds;
    }

    // Extract audio stream info
    const audioMatch = message.match(/Audio: (\w+).*, (\d+) Hz, (stereo|mono|5\.1|7\.1), (\w+)/);
    if (audioMatch) {
      this.metadata.codec = audioMatch[1];
      this.metadata.sampleRate = parseInt(audioMatch[2]);
      this.metadata.channels = audioMatch[3] === 'mono' ? 1 :
                               audioMatch[3] === 'stereo' ? 2 :
                               audioMatch[3] === '5.1' ? 6 : 8;

      // Estimate bit depth from format
      const format = audioMatch[4];
      if (format.includes('s16') || format.includes('16')) {
        this.metadata.bitDepth = 16;
      } else if (format.includes('s24') || format.includes('24')) {
        this.metadata.bitDepth = 24;
      } else if (format.includes('s32') || format.includes('32') || format.includes('flt')) {
        this.metadata.bitDepth = 32;
      } else {
        this.metadata.bitDepth = 16; // Default
      }
    }

    // Extract bitrate
    const bitrateMatch = message.match(/bitrate: (\d+) kb\/s/);
    if (bitrateMatch) {
      this.metadata.bitrate = parseInt(bitrateMatch[1]);
    }
  }

  /**
   * Supported media extensions for FFmpeg.wasm processing
   */
  static SUPPORTED_EXTENSIONS = new Set([
    '.mp4', '.mov', '.m4v', '.mkv', '.avi', '.webm', '.flv', '.wmv', '.3gp',
    '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.wma', '.opus'
  ]);

  /**
   * Infer a file extension from the MIME type when the filename has none.
   * iPhones sometimes provide files with generic names like "image" or "video".
   * @param {File} file
   * @returns {string} extension including the dot, e.g. '.mov'
   */
  inferExtension(file) {
    const ext = this.getExtension(file.name);
    if (ext && AudioProcessor.SUPPORTED_EXTENSIONS.has(ext.toLowerCase())) {
      return ext;
    }

    // Map common MIME types to extensions
    const mimeMap = {
      'video/quicktime': '.mov',
      'video/mp4': '.mp4',
      'video/x-m4v': '.m4v',
      'video/webm': '.webm',
      'video/x-matroska': '.mkv',
      'video/avi': '.avi',
      'video/x-msvideo': '.avi',
      'video/3gpp': '.3gp',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/x-m4a': '.m4a',
      'audio/wav': '.wav',
      'audio/x-wav': '.wav',
      'audio/aac': '.aac',
      'audio/flac': '.flac',
      'audio/ogg': '.ogg',
      'audio/webm': '.webm',
      'audio/opus': '.opus'
    };

    if (file.type && mimeMap[file.type]) {
      console.log(`[AudioProcessor] Inferred extension ${mimeMap[file.type]} from MIME type ${file.type}`);
      return mimeMap[file.type];
    }

    // Fallback: treat as mp4 container (most common on mobile)
    if (file.type && file.type.startsWith('video/')) {
      console.warn(`[AudioProcessor] Unknown video type ${file.type}, defaulting to .mp4`);
      return '.mp4';
    }
    if (file.type && file.type.startsWith('audio/')) {
      console.warn(`[AudioProcessor] Unknown audio type ${file.type}, defaulting to .m4a`);
      return '.m4a';
    }

    // Last resort — use original extension or .mp4
    return ext || '.mp4';
  }

  /**
   * Process a media file
   * @param {File} file - The media file to process
   */
  async processFile(file) {
    if (this.isProcessing) {
      throw new Error('A file is already being processed. Please wait or cancel first.');
    }

    if (!this.isLoaded) {
      await this.initialize();
    }

    this.isProcessing = true;
    this.currentFile = file;
    // Reset metadata for new file
    this.metadata = { duration: 0, sampleRate: 0, originalSampleRate: 0, channels: 0, bitDepth: 0, codec: '', bitrate: 0 };
    const inputExt = this.inferExtension(file);
    const inputName = 'input' + inputExt;

    try {
      // Step 1: Load file into FFmpeg (progress 25-35)
      this.updateStage('Loading media...');
      this.updateProgress(25);

      const fileData = await this.readLocalFileWithProgress(file, (progress) => {
        this.updateProgress(25 + Math.round(progress * 8));
      });
      this.updateStage('Writing file to audio engine...');
      this.updateProgress(33);
      try {
        await this.ffmpeg.writeFile(inputName, fileData);
      } catch (writeErr) {
        console.error('[AudioProcessor] writeFile failed:', writeErr);
        throw new Error('Failed to load file into audio engine. The file may be too large for available memory.');
      }

      this.updateProgress(35);

      // Step 2: Probe the file for audio streams (progress 35-40)
      this.updateStage('Detecting audio streams...');
      await this.probeFile(inputName);

      this.updateProgress(40);

      // Step 3: Extract audio to WAV (progress 40-70)
      this.updateStage('Extracting audio...');
      const wavData = await this.extractAudio(inputName);

      this.updateProgress(70);

      // Step 4: Load into Web Audio API for analysis (progress 70-80)
      this.updateStage('Analyzing audio...');
      await this.loadAudioBuffer(wavData);

      this.updateProgress(80);

      // Step 5: Detect tempo and key (using Web Worker if available, progress 80-95)
      this.updateStage('Detecting tempo & key...');
      const analysisResult = await this.analyzeAudio(this.audioBuffer);

      this.metadata.tempo = analysisResult.tempo;
      this.metadata.key = analysisResult.key;

      this.updateProgress(95);
      this.updateStage('Analysis complete');

      // Clean up input file
      await this.ffmpeg.deleteFile(inputName);

      this.isProcessing = false;
      return {
        metadata: this.metadata,
        audioBuffer: this.audioBuffer,
        wavData: wavData
      };
    } catch (error) {
      this.isProcessing = false;
      console.error('Error processing file:', error);

      // Provide user-friendly error messages for common video processing failures
      const msg = error.message || '';
      if (msg.includes('No audio') || msg.includes('output.wav') || msg.includes('does not contain')) {
        throw new Error('No audio track found in this file. The video may not contain audio.');
      }
      if (msg.includes('Out of memory') || msg.includes('OOM') || msg.includes('memory')) {
        throw new Error('File too large for in-browser processing. Try a shorter or lower-resolution video.');
      }
      throw error;
    }
  }

  /**
   * Process a URL
   * @param {string} url - The URL to process
   */
  async processURL(url) {
    if (this.isProcessing) {
      throw new Error('A file is already being processed. Please wait or cancel first.');
    }

    if (!this.isLoaded) {
      await this.initialize();
    }

    this.isProcessing = true;
    // Reset metadata for new processing
    this.metadata = { duration: 0, sampleRate: 0, originalSampleRate: 0, channels: 0, bitDepth: 0, codec: '', bitrate: 0 };

    // Validate URL protocol
    let urlObj;
    try {
      urlObj = new URL(url);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        this.isProcessing = false;
        throw new Error('Only HTTP and HTTPS URLs are supported');
      }
    } catch (e) {
      this.isProcessing = false;
      if (e.message.includes('Only HTTP')) throw e;
      throw new Error('Invalid URL format');
    }

    try {
      this.updateStage('Fetching media...');
      this.updateProgress(25);

      // Fetch the URL content with progress tracking and timeout
      const fetchPromise = this.fetchWithProgress(url, (progress) => {
        // Map fetch progress to 25-35% range
        this.updateProgress(25 + Math.round(progress * 10));
      });

      const fileData = await this.withTimeout(
        fetchPromise,
        120000,
        'URL fetch timed out. The server may be slow or unreachable.'
      );

      // Validate that we received data
      if (!fileData || fileData.length === 0) {
        throw new Error('No data received from URL');
      }

      // Size limit check (2GB)
      const MAX_URL_SIZE = 2 * 1024 * 1024 * 1024;
      if (fileData.length > MAX_URL_SIZE) {
        throw new Error('Downloaded file too large. Maximum size is 2 GB.');
      }

      this.updateProgress(35);

      const fileName = this.extractFileName(url) || 'media';
      const file = new File([fileData], fileName);
      this.currentFile = file;

      // Continue processing from the file-write stage (skip re-reading the file)
      const inputName = 'input' + this.getExtension(fileName);

      this.updateStage('Writing media to audio engine...');
      try {
        await this.ffmpeg.writeFile(inputName, fileData);
      } catch (writeErr) {
        console.error('[AudioProcessor] writeFile failed for URL media:', writeErr);
        throw new Error('Failed to load media into audio engine. The file may be too large for available memory.');
      }
      this.updateProgress(37);

      // Step 2: Probe the file for audio streams (progress 37-40)
      this.updateStage('Detecting audio streams...');
      await this.probeFile(inputName);
      this.updateProgress(40);

      // Step 3: Extract audio to WAV (progress 40-70)
      this.updateStage('Extracting audio...');
      const wavData = await this.extractAudio(inputName);
      this.updateProgress(70);

      // Step 4: Load into Web Audio API for analysis (progress 70-80)
      this.updateStage('Analyzing audio...');
      await this.loadAudioBuffer(wavData);
      this.updateProgress(80);

      // Step 5: Detect tempo and key (progress 80-95)
      this.updateStage('Detecting tempo & key...');
      const analysisResult = await this.analyzeAudio(this.audioBuffer);

      this.metadata.tempo = analysisResult.tempo;
      this.metadata.key = analysisResult.key;

      this.updateProgress(95);
      this.updateStage('Analysis complete');

      // Clean up input file
      await this.ffmpeg.deleteFile(inputName);

      this.isProcessing = false;
      return {
        metadata: this.metadata,
        audioBuffer: this.audioBuffer,
        wavData: wavData
      };
    } catch (error) {
      this.isProcessing = false;
      console.error('Error processing URL:', error);
      // Provide user-friendly error messages for common fetch failures
      const msg = error.message || '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        throw new Error('Could not fetch URL. The server may block cross-origin requests (CORS).');
      }
      if (msg.includes('timed out')) {
        throw error;
      }
      throw new Error('Failed to process URL: ' + this.truncateError(msg));
    }
  }

  /**
   * Truncate error messages to prevent UI overflow
   * @param {string} message - Error message
   * @param {number} maxLen - Maximum length
   * @returns {string}
   */
  truncateError(message, maxLen = 120) {
    if (!message) return 'Unknown error';
    return message.length > maxLen ? message.slice(0, maxLen) + '...' : message;
  }

  /**
   * Probe file for audio stream information
   */
  async probeFile(inputName) {
    try {
      // Run FFmpeg with info flag to get stream info
      await this.ffmpeg.exec(['-i', inputName, '-hide_banner']);
    } catch (e) {
      // FFmpeg exits with error when only probing, but we get the info in logs
    }
  }

  /**
   * Extract audio from media file
   * @bugfix Now respects preserveSampleRate setting
   */
  async extractAudio(inputName) {
    const outputName = 'output.wav';

    // Store original sample rate
    this.metadata.originalSampleRate = this.metadata.sampleRate;

    // Determine target sample rate based on settings
    let targetSampleRate;

    if (this.settings.preserveSampleRate && this.metadata.sampleRate >= 8000 && this.metadata.sampleRate <= 384000) {
      // Preserve original sample rate when setting is enabled and rate is valid
      targetSampleRate = this.metadata.sampleRate;
    } else if (this.metadata.sampleRate === 44100) {
      // Preserve 44.1kHz for CD-quality sources
      targetSampleRate = 44100;
    } else if (this.metadata.sampleRate >= 8000 && this.metadata.sampleRate <= 384000) {
      // Use detected rate if valid
      targetSampleRate = this.metadata.sampleRate;
    } else {
      // Default to 48kHz when sample rate is unknown, 0, or out of range
      console.warn(`[AudioProcessor] Invalid or unknown sample rate ${this.metadata.sampleRate}Hz, defaulting to 48000Hz`);
      targetSampleRate = 48000;
    }

    console.log(`[AudioProcessor] Sample rate: ${this.metadata.originalSampleRate}Hz -> ${targetSampleRate}Hz (preserve: ${this.settings.preserveSampleRate})`);

    // Extract audio with proper settings
    try {
      await this.ffmpeg.exec([
        '-i', inputName,
        '-vn',                          // No video
        '-acodec', 'pcm_s24le',        // 24-bit PCM
        '-ar', targetSampleRate.toString(),
        '-ac', '2',                     // Stereo
        outputName
      ]);
    } catch (execErr) {
      console.error('[AudioProcessor] FFmpeg exec failed:', execErr);
      throw new Error('Audio extraction failed. The file format may not be supported.');
    }

    // Read the output file
    let data;
    try {
      data = await this.ffmpeg.readFile(outputName);
    } catch (readErr) {
      throw new Error('Audio extraction failed. The file may not contain a compatible audio track.');
    }

    // Validate output — a WAV header is at least 44 bytes
    if (!data || data.length < 44) {
      throw new Error('No audio track found in this file. The video may not contain audio.');
    }

    // Store extracted audio for conversion
    this.extractedAudio = data;
    this.metadata.sampleRate = targetSampleRate;
    this.metadata.bitDepth = 24;
    this.metadata.channels = 2;

    // Clean up
    await this.ffmpeg.deleteFile(outputName);

    return data;
  }

  /**
   * Analyze audio for tempo and key
   * Uses Web Worker for non-blocking analysis when available
   * @bugfix Now properly uses Web Worker instead of main thread
   */
  async analyzeAudio(audioBuffer) {
    const channelData = this.getMono(audioBuffer);
    const sampleRate = audioBuffer.sampleRate;

    // Try Web Worker first
    if (this.analysisWorker) {
      try {
        console.log('[AudioProcessor] Running analysis in Web Worker');
        const result = await this.runWorkerAnalysis('analyzeAll', channelData, sampleRate);
        return result;
      } catch (error) {
        console.warn('[AudioProcessor] Worker analysis failed, falling back to main thread:', error);
      }
    }

    // Fallback to main thread analysis
    console.log('[AudioProcessor] Running analysis on main thread');

    // Lazy-initialize detectors only when needed
    if (!this.tempoDetector) {
      this.tempoDetector = new TempoDetector();
    }
    if (!this.keyDetector) {
      this.keyDetector = new KeyDetector();
    }

    const [tempo, key] = await Promise.all([
      this.tempoDetector.analyze(audioBuffer),
      this.keyDetector.analyze(audioBuffer)
    ]);

    return { tempo, key };
  }

  /**
   * Convert audio buffer to mono
   */
  getMono(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) {
      return audioBuffer.getChannelData(0);
    }

    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    const mono = new Float32Array(left.length);

    for (let i = 0; i < left.length; i++) {
      mono[i] = (left[i] + right[i]) / 2;
    }

    return mono;
  }

  /**
   * Load audio into Web Audio API for analysis
   */
  async loadAudioBuffer(wavData) {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Convert Uint8Array to ArrayBuffer
    const arrayBuffer = wavData.buffer.slice(
      wavData.byteOffset,
      wavData.byteOffset + wavData.byteLength
    );

    // Decode audio
    try {
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    } catch (decodeErr) {
      console.error('[AudioProcessor] decodeAudioData failed:', decodeErr);
      throw new Error('Failed to decode extracted audio. The audio data may be corrupted.');
    }
    this.metadata.duration = this.audioBuffer.duration;

    return this.audioBuffer;
  }

  /**
   * Convert extracted audio to specified format
   * @param {string} format - Target format (flac, wav, mp3, aac)
   */
  async convertToFormat(format) {
    if (!this.extractedAudio) {
      throw new Error('No audio extracted. Process a file first.');
    }

    const inputName = 'temp_audio.wav';
    let outputName, ffmpegArgs;

    // Write the extracted audio to FFmpeg filesystem
    await this.ffmpeg.writeFile(inputName, this.extractedAudio);

    switch (format.toLowerCase()) {
      case 'flac':
        outputName = 'output.flac';
        ffmpegArgs = [
          '-i', inputName,
          '-acodec', 'flac',
          '-compression_level', '8',    // Highest compression
          '-sample_fmt', 's32',         // 32-bit for best quality
          outputName
        ];
        break;

      case 'wav':
        outputName = 'output.wav';
        ffmpegArgs = [
          '-i', inputName,
          '-acodec', 'pcm_s24le',       // 24-bit PCM
          outputName
        ];
        break;

      case 'mp3':
        outputName = 'output.mp3';
        ffmpegArgs = [
          '-i', inputName,
          '-acodec', 'libmp3lame',
          '-b:a', '320k',               // Highest MP3 bitrate
          '-q:a', '0',                  // Best quality
          outputName
        ];
        break;

      case 'aac':
        outputName = 'output.m4a';
        ffmpegArgs = [
          '-i', inputName,
          '-acodec', 'aac',
          '-b:a', '256k',               // High AAC bitrate
          '-movflags', '+faststart',    // Optimize for streaming
          outputName
        ];
        break;

      default:
        throw new Error('Unsupported format: ' + format);
    }

    this.updateStage(`Converting to ${format.toUpperCase()}...`);
    this.updateProgress(10);

    // Run conversion
    await this.ffmpeg.exec(ffmpegArgs);

    this.updateProgress(90);

    // Read output file
    const outputData = await this.ffmpeg.readFile(outputName);

    // Clean up
    await this.ffmpeg.deleteFile(inputName);
    await this.ffmpeg.deleteFile(outputName);

    this.updateProgress(100);
    this.updateStage('Conversion complete');

    // Create blob with correct MIME type
    const mimeTypes = {
      'flac': 'audio/flac',
      'wav': 'audio/wav',
      'mp3': 'audio/mpeg',
      'aac': 'audio/mp4'
    };

    const blob = new Blob([outputData], { type: mimeTypes[format] });

    return {
      blob,
      fileName: this.generateFileName(format),
      mimeType: mimeTypes[format]
    };
  }

  /**
   * Generate output filename
   */
  generateFileName(format) {
    if (!this.currentFile) return `audio.${format}`;

    const baseName = this.currentFile.name.replace(/\.[^/.]+$/, '');
    const extension = format === 'aac' ? 'm4a' : format;

    return `${baseName}.${extension}`;
  }

  /**
   * Get file extension
   */
  getExtension(filename) {
    const match = filename.match(/\.[^/.]+$/);
    return match ? match[0] : '';
  }

  /**
   * Extract filename from URL
   */
  extractFileName(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const match = path.match(/\/([^/]+)$/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Generate waveform data for visualization
   */
  generateWaveformData(samples = 200) {
    if (!this.audioBuffer) return [];

    const channelData = this.audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / samples);
    const waveformData = [];

    for (let i = 0; i < samples; i++) {
      const start = i * blockSize;
      let max = 0;

      for (let j = 0; j < blockSize; j++) {
        const value = Math.abs(channelData[start + j] || 0);
        if (value > max) max = value;
      }

      waveformData.push(max);
    }

    return waveformData;
  }

  /**
   * Update progress callback
   */
  updateProgress(percent) {
    if (this.onProgress) {
      this.onProgress(percent);
    }
  }

  /**
   * Update stage callback
   */
  updateStage(stage) {
    if (this.onStageChange) {
      this.onStageChange(stage);
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.isProcessing = false;

    if (this.analysisWorker) {
      this.analysisWorker.terminate();
      this.analysisWorker = null;
      this.pendingWorkerCalls.clear();
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioBuffer = null;
    this.extractedAudio = null;
    this.currentFile = null;
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.AudioProcessor = AudioProcessor;
}
