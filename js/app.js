/**
 * reSOURCERY - Main Application
 * Premium audio extraction and analysis studio
 *
 * Version is managed centrally via js/version.js (APP_VERSION).
 *
 * @bugfix Fixed progress callback override in handleFormatSelect
 * @bugfix Fixed progress flow conflicts between app and processor
 * @bugfix Added file size validation
 * @bugfix Added URL protocol validation
 * @bugfix Fixed file input not resetting for repeat selections
 * @bugfix Fixed worker not terminated on destroy
 * @bugfix Fixed version inconsistencies via modular version config
 */

// Key-token notation for download filenames: "F#m" (minor) / "F#" (major).
// Swap these suffixes to change notation (e.g. 'min'/'maj').
const KEY_MINOR_SUFFIX = 'm';
const KEY_MAJOR_SUFFIX = '';

// Canvas-side mirrors of the CSS design tokens (canvas can't read custom
// properties). Keep in sync with :root in css/styles.css —
// --indigo-300 #7088dd, --indigo-400 #5568cc, --indigo-500 #4455aa.
const WAVEFORM_COLORS = {
  unplayedTop: 'rgba(34, 211, 238, 0.35)',
  unplayedMid: 'rgba(13, 148, 136, 0.25)',
  playedTop: 'rgba(112, 136, 221, 0.95)',   // --indigo-300
  playedMid: 'rgba(85, 104, 204, 0.75)',    // --indigo-400
  washTop: 'rgba(85, 104, 204, 0.14)',      // --indigo-400
  washBottom: 'rgba(68, 85, 170, 0.05)',    // --indigo-500
  playhead: '#7088dd',                       // --indigo-300
  playheadHalo: 'rgba(112, 136, 221, 0.28)'
};

class ReSOURCERYApp {
  constructor() {
    // State
    this.processor = null;
    this.audioElement = null;
    this.isPlaying = false;
    this.currentResult = null;
    this.waveformData = [];
    this.audioObjectURL = null;
    this.isConverting = false;
    this.resizeTimer = null;

    // Download naming (remembered per loaded track)
    this.trackTitle = '';
    this.pendingFormat = null;
    this.pendingFormatBtn = null;

    // Waveform playback overlay
    this.rafId = null;
    this.waveformMetrics = null;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // DOM Elements
    this.elements = {};

    // Settings
    this.settings = {
      preserveSampleRate: true,
      autoDetectMusic: true,
      showWaveform: true
    };

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  /**
   * Initialize the application
   */
  async init() {
    this.cacheElements();
    this.bindEvents();
    this.loadSettings();
    this.injectVersion();
    this.registerServiceWorker();
    this.initAudioProcessor();

    console.log(`reSOURCERY ${APP_VERSION.display} initialized`);
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      // Sections
      uploadSection: document.getElementById('uploadSection'),
      processingSection: document.getElementById('processingSection'),
      resultsSection: document.getElementById('resultsSection'),

      // Upload
      urlInput: document.getElementById('urlInput'),
      urlSubmitBtn: document.getElementById('urlSubmitBtn'),
      dropZone: document.getElementById('dropZone'),
      fileInput: document.getElementById('fileInput'),

      // Processing
      fileName: document.getElementById('fileName'),
      fileSize: document.getElementById('fileSize'),
      progressFill: document.getElementById('progressFill'),
      progressStage: document.getElementById('progressStage'),
      progressPercent: document.getElementById('progressPercent'),
      stageRingFill: document.getElementById('stageRingFill'),
      stageIconInner: document.getElementById('stageIconInner'),
      cancelBtn: document.getElementById('cancelBtn'),
      steps: {
        step1: document.getElementById('step1'),
        step2: document.getElementById('step2'),
        step3: document.getElementById('step3'),
        step4: document.getElementById('step4')
      },

      // Results
      newExtractBtn: document.getElementById('newExtractBtn'),
      waveformCanvas: document.getElementById('waveformCanvas'),
      waveformContainer: document.getElementById('waveformContainer'),
      playBtn: document.getElementById('playBtn'),
      seekBar: document.getElementById('seekBar'),
      currentTime: document.getElementById('currentTime'),
      totalTime: document.getElementById('totalTime'),

      // Metadata
      metaDuration: document.getElementById('metaDuration'),
      metaSampleRate: document.getElementById('metaSampleRate'),
      metaChannels: document.getElementById('metaChannels'),
      metaBitDepth: document.getElementById('metaBitDepth'),
      metaTempo: document.getElementById('metaTempo'),
      metaKey: document.getElementById('metaKey'),

      // Download
      formatBtns: document.querySelectorAll('.format-btn'),
      downloadProgress: document.getElementById('downloadProgress'),
      downloadStatus: document.getElementById('downloadStatus'),
      downloadBarFill: document.getElementById('downloadBarFill'),

      // Naming dialog
      nameDialog: document.getElementById('nameDialog'),
      nameDialogOverlay: document.getElementById('nameDialogOverlay'),
      nameDialogFormat: document.getElementById('nameDialogFormat'),
      trackTitleInput: document.getElementById('trackTitleInput'),
      namePreview: document.getElementById('namePreview'),
      nameCancelBtn: document.getElementById('nameCancelBtn'),
      nameConfirmBtn: document.getElementById('nameConfirmBtn'),

      // Settings
      menuBtn: document.getElementById('menuBtn'),
      settingsPanel: document.getElementById('settingsPanel'),
      settingsOverlay: document.getElementById('settingsOverlay'),
      settingsClose: document.getElementById('settingsClose'),
      preserveSampleRate: document.getElementById('preserveSampleRate'),
      autoDetectMusic: document.getElementById('autoDetectMusic'),
      showWaveform: document.getElementById('showWaveform'),

      // Toast
      toastContainer: document.getElementById('toastContainer'),

      // Audio
      audioPlayer: document.getElementById('audioPlayer'),

      // Version
      versionBadge: document.getElementById('versionBadge'),
      settingsVersion: document.getElementById('settingsVersion')
    };

    this.audioElement = this.elements.audioPlayer;
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // URL input
    this.elements.urlSubmitBtn.addEventListener('click', () => this.handleURLSubmit());
    this.elements.urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleURLSubmit();
    });

    // File drop zone
    this.elements.dropZone.addEventListener('click', () => this.elements.fileInput.click());
    this.elements.dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.elements.fileInput.click();
      }
    });
    this.elements.dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.elements.dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    this.elements.dropZone.addEventListener('drop', (e) => this.handleDrop(e));
    this.elements.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    // Processing
    this.elements.cancelBtn.addEventListener('click', () => this.cancelProcessing());

    // Results
    this.elements.newExtractBtn.addEventListener('click', () => this.resetToUpload());
    this.elements.playBtn.addEventListener('click', () => this.togglePlayback());
    this.elements.seekBar.addEventListener('input', (e) => this.handleSeek(e));

    // Audio player events
    this.audioElement.addEventListener('timeupdate', () => this.updateTimeDisplay());
    this.audioElement.addEventListener('ended', () => this.handlePlaybackEnd());
    this.audioElement.addEventListener('loadedmetadata', () => this.handleAudioLoaded());

    // Playhead animation follows the element's real state, so OS media
    // controls and programmatic play/pause stay in sync with the UI
    this.audioElement.addEventListener('play', () => {
      this.isPlaying = true;
      this.elements.playBtn.classList.add('playing');
      this.startPlayheadLoop();
    });
    this.audioElement.addEventListener('pause', () => {
      this.isPlaying = false;
      this.elements.playBtn.classList.remove('playing');
      this.stopPlayheadLoop();
      if (this.settings.showWaveform) {
        this.drawWaveform(this.getPlaybackProgress());
      }
    });

    // Halt the animation loop live if the user enables reduced motion
    this.reducedMotion.addEventListener('change', () => {
      if (this.reducedMotion.matches) {
        this.stopPlayheadLoop();
      } else if (this.isPlaying) {
        this.startPlayheadLoop();
      }
    });

    // Click/tap the waveform to seek (keyboard users have the seek bar)
    this.elements.waveformContainer.addEventListener('click', (e) => this.handleWaveformSeek(e));

    // Format buttons
    this.elements.formatBtns.forEach(btn => {
      btn.addEventListener('click', () => this.handleFormatSelect(btn));
    });

    // Naming dialog
    this.elements.nameConfirmBtn.addEventListener('click', () => this.confirmDownload());
    this.elements.nameCancelBtn.addEventListener('click', () => this.closeNameDialog());
    this.elements.nameDialogOverlay.addEventListener('click', () => this.closeNameDialog());
    this.elements.trackTitleInput.addEventListener('input', () => this.updateNamePreview());
    this.elements.trackTitleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmDownload();
      }
    });

    // Settings
    this.elements.menuBtn.addEventListener('click', () => this.toggleSettings(true));
    this.elements.settingsOverlay.addEventListener('click', () => this.toggleSettings(false));
    this.elements.settingsClose.addEventListener('click', () => this.toggleSettings(false));

    // Settings toggles
    this.elements.preserveSampleRate.addEventListener('change', (e) => {
      this.settings.preserveSampleRate = e.target.checked;
      this.saveSettings();
      // Update processor settings
      if (this.processor) {
        this.processor.updateSettings({ preserveSampleRate: e.target.checked });
      }
    });

    this.elements.autoDetectMusic.addEventListener('change', (e) => {
      this.settings.autoDetectMusic = e.target.checked;
      this.saveSettings();
    });

    this.elements.showWaveform.addEventListener('change', (e) => {
      this.settings.showWaveform = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        if (!this.elements.resultsSection.classList.contains('hidden')) {
          this.setupWaveformCanvas();
          this.drawWaveform(this.getPlaybackProgress());
          if (this.isPlaying) this.startPlayheadLoop();
        }
      } else {
        this.stopPlayheadLoop();
        this.clearWaveform();
      }
    });

    // Escape closes the naming dialog first, then the settings panel
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!this.elements.nameDialog.classList.contains('hidden')) {
        this.closeNameDialog();
        return;
      }
      if (!this.elements.settingsPanel.classList.contains('hidden')) {
        this.toggleSettings(false);
      }
    });

    // Redraw waveform when the viewport changes (resize / orientation)
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        if (!this.elements.resultsSection.classList.contains('hidden')) {
          this.setupWaveformCanvas();
          this.drawWaveform(this.getPlaybackProgress());
        }
      }, 150);
    });

    // Prevent default behaviors
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());
  }

  /**
   * Initialize audio processor
   * @bugfix Now passes settings to AudioProcessor
   */
  async initAudioProcessor() {
    try {
      this.processor = new AudioProcessor({
        preserveSampleRate: this.settings.preserveSampleRate,
        useWebWorker: true
      });

      // Set up callbacks
      this.setupProcessorCallbacks();

      console.log('[reSOURCERY] Audio processor created');
    } catch (error) {
      console.error('[reSOURCERY] Failed to create audio processor:', error);
      this.showToast('Failed to initialize audio engine', 'error');
    }
  }

  /**
   * Register service worker
   */
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js');
        console.log('Service Worker registered:', registration.scope);
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  /**
   * Handle URL submission
   */
  async handleURLSubmit() {
    const url = this.elements.urlInput.value.trim();

    if (!url) {
      this.showToast('Please enter a URL', 'error');
      return;
    }

    if (!this.isValidURL(url)) {
      this.showToast('Please enter a valid URL', 'error');
      return;
    }

    // YouTube streams are ciphered — no extraction attempt, no section switch
    if (AudioProcessor.isYouTubeURL(url)) {
      this.showToast('YouTube links can\'t be extracted here — YouTube serves protected streams. Download the video with a dedicated tool, then drop the file here.', 'error');
      return;
    }

    await this.processMedia(url, 'url');
  }

  /**
   * Validate URL - only allows http and https protocols
   */
  isValidURL(string) {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Handle drag over
   */
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    this.elements.dropZone.classList.add('drag-over');
  }

  /**
   * Handle drag leave
   */
  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    this.elements.dropZone.classList.remove('drag-over');
  }

  /**
   * Handle file drop
   */
  async handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.elements.dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await this.processMedia(files[0], 'file');
    }
  }

  /**
   * Handle file selection
   */
  async handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
      const file = files[0];
      // Reset file input so the same file can be re-selected
      e.target.value = '';
      await this.processMedia(file, 'file');
    }
  }

  /**
   * Process media (file or URL)
   */
  async processMedia(source, type) {
    // File size limit: 2GB
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

    try {
      // Validate file size
      if (type === 'file' && source.size > MAX_FILE_SIZE) {
        this.showToast('File too large. Maximum size is 2 GB.', 'error');
        return;
      }

      if (type === 'file' && source.size === 0) {
        this.showToast('File is empty.', 'error');
        return;
      }

      // Validate file type — reject files that aren't audio or video
      if (type === 'file' && source.type && !source.type.startsWith('audio/') && !source.type.startsWith('video/')) {
        this.showToast('Unsupported file type. Please upload an audio or video file.', 'error');
        return;
      }

      // Show processing section
      this.showSection('processing');

      // Update file info
      if (type === 'file') {
        this.elements.fileName.textContent = source.name;
        this.elements.fileSize.textContent = this.formatFileSize(source.size);
      } else {
        this.elements.fileName.textContent = this.extractFileName(source) || 'URL Media';
        this.elements.fileSize.textContent = 'Fetching...';
      }

      // Reset progress
      this.resetProgress();

      // Ensure progress callback is set correctly for processing
      this.setupProcessorCallbacks();

      // Initialize processor if needed
      if (!this.processor || !this.processor.isLoaded) {
        this.setStepActive('step1');
        this.updateStage('Loading audio engine...');

        // Ensure processor exists
        if (!this.processor) {
          await this.initAudioProcessor();
        }

        try {
          await this.processor.initialize();
          this.setStepCompleted('step1');
        } catch (initError) {
          console.error('[reSOURCERY] Initialization failed:', initError);
          // Processor resets its own state on failure, so retry is possible
          // without a page refresh. Surface the specific error to the user.
          throw new Error(initError.message || 'Failed to load audio engine. Please try again.');
        }
      } else {
        this.setStepCompleted('step1');
        this.updateProgress(25);
      }

      // Process the media
      this.setStepActive('step2');
      this.updateStage(type === 'file' ? 'Processing file...' : 'Fetching media...');
      let result;

      try {
        if (type === 'file') {
          result = await this.processor.processFile(source);
        } else {
          result = await this.processor.processURL(source);
        }
      } catch (processingError) {
        // Mark step2 as failed and re-throw for outer handler
        throw processingError;
      }

      this.setStepCompleted('step2');
      this.setStepActive('step3');
      this.updateStage('Analyzing audio...');

      // Short delay for UI
      await this.delay(300);
      this.setStepCompleted('step3');

      if (this.settings.autoDetectMusic) {
        this.setStepActive('step4');
        this.updateStage('Detecting tempo & key...');
        await this.delay(500);
        this.setStepCompleted('step4');
      }

      // Store result
      this.currentResult = result;

      // Generate waveform data
      this.waveformData = this.processor.generateWaveformData(200);

      // Update progress to 100%
      this.updateProgress(100);
      this.updateStage('Complete!');

      // Show results
      this.showResults(result);

    } catch (error) {
      console.error('[reSOURCERY] Processing error:', error);
      // Truncate error messages to prevent UI overflow
      const msg = error.message || 'Failed to process media. Please try again.';
      const truncated = msg.length > 150 ? msg.slice(0, 150) + '...' : msg;
      this.showToast(truncated, 'error');
      this.resetToUpload();
    }
  }

  /**
   * Set up processor callbacks for progress and stage updates
   */
  setupProcessorCallbacks() {
    if (this.processor) {
      this.processor.onProgress = (percent) => {
        this.updateProgress(percent);
      };
      this.processor.onStageChange = (stage) => {
        this.updateStage(stage);
      };
    }
  }

  /**
   * Show results
   */
  showResults(result) {
    // Update metadata display
    this.elements.metaDuration.textContent = this.formatDuration(result.metadata.duration);
    this.elements.metaSampleRate.textContent = `${(result.metadata.sampleRate / 1000).toFixed(1)} kHz`;
    this.elements.metaChannels.textContent = result.metadata.channels === 1 ? 'Mono' :
                                              result.metadata.channels === 2 ? 'Stereo' :
                                              `${result.metadata.channels} ch`;
    this.elements.metaBitDepth.textContent = `${result.metadata.bitDepth} bit`;

    // Update tempo and key
    if (result.metadata.tempo) {
      this.elements.metaTempo.textContent = `${result.metadata.tempo.bpm} BPM`;
    } else {
      this.elements.metaTempo.textContent = '--';
    }

    if (result.metadata.key) {
      this.elements.metaKey.textContent = result.metadata.key.fullKey;
    } else {
      this.elements.metaKey.textContent = '--';
    }

    // Seed the download title for this track (page title > filename > 'audio')
    this.trackTitle = this.deriveDefaultTitle();

    // Revoke previous audio URL if any
    if (this.audioObjectURL) {
      URL.revokeObjectURL(this.audioObjectURL);
    }

    // Create audio blob for playback
    const wavBlob = new Blob([result.wavData], { type: 'audio/wav' });
    this.audioObjectURL = URL.createObjectURL(wavBlob);
    this.audioElement.src = this.audioObjectURL;

    // Show results section first — the canvas parent must be laid out
    // (non-zero size) before the waveform can be measured and drawn
    this.showSection('results');

    if (this.settings.showWaveform) {
      this.setupWaveformCanvas();
      this.drawWaveform();
    }
    this.updateSeekBarFill(0);
  }

  /**
   * Measure the canvas, size the backing store for the device pixel ratio,
   * and pre-build the gradients. Cached in this.waveformMetrics so the
   * rAF-driven drawWaveform() does no layout reads or allocations.
   * Returns null while the results section is hidden (zero-size parent).
   */
  setupWaveformCanvas() {
    const canvas = this.elements.waveformCanvas;
    if (!canvas) return null;

    const rect = canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      this.waveformMetrics = null;
      return null;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const height = rect.height;

    // Unplayed bars: dim cyan; played bars + overlay: icon blue (indigo)
    const unplayed = ctx.createLinearGradient(0, 0, 0, height);
    unplayed.addColorStop(0, WAVEFORM_COLORS.unplayedTop);
    unplayed.addColorStop(0.5, WAVEFORM_COLORS.unplayedMid);
    unplayed.addColorStop(1, WAVEFORM_COLORS.unplayedTop);

    const played = ctx.createLinearGradient(0, 0, 0, height);
    played.addColorStop(0, WAVEFORM_COLORS.playedTop);
    played.addColorStop(0.5, WAVEFORM_COLORS.playedMid);
    played.addColorStop(1, WAVEFORM_COLORS.playedTop);

    const wash = ctx.createLinearGradient(0, 0, 0, height);
    wash.addColorStop(0, WAVEFORM_COLORS.washTop);
    wash.addColorStop(1, WAVEFORM_COLORS.washBottom);

    this.waveformMetrics = {
      ctx,
      width: rect.width,
      height,
      gradients: { unplayed, played, wash }
    };
    return this.waveformMetrics;
  }

  /**
   * Draw the waveform with the playback overlay: played bars in indigo,
   * a translucent blue wash sweeping left→right, and a playhead marker.
   * Runs at 60fps during playback — keep this allocation- and layout-free.
   * @param {number} progress - Playback position 0..1
   */
  drawWaveform(progress = 0) {
    if (!this.waveformData.length) return;

    const metrics = this.waveformMetrics || this.setupWaveformCanvas();
    if (!metrics) return;

    const { ctx, width, height, gradients } = metrics;
    ctx.clearRect(0, 0, width, height);

    const barWidth = width / this.waveformData.length;
    const centerY = height / 2;
    const playedBars = Math.floor(progress * this.waveformData.length);

    for (let i = 0; i < this.waveformData.length; i++) {
      const value = this.waveformData[i];
      const barHeight = value * height * 0.8;

      ctx.fillStyle = i < playedBars ? gradients.played : gradients.unplayed;
      ctx.fillRect(
        i * barWidth,
        centerY - barHeight / 2,
        barWidth - 1,
        barHeight
      );
    }

    if (progress > 0) {
      const x = progress * width;

      // Translucent indigo wash over the played region
      ctx.fillStyle = gradients.wash;
      ctx.fillRect(0, 0, x, height);

      // Playhead: soft halo + solid core + end caps
      ctx.fillStyle = WAVEFORM_COLORS.playheadHalo;
      ctx.fillRect(x - 3, 0, 6, height);
      ctx.fillStyle = WAVEFORM_COLORS.playhead;
      ctx.fillRect(x - 1, 0, 2, height);
      ctx.fillRect(x - 2.5, 0, 5, 2);
      ctx.fillRect(x - 2.5, height - 2, 5, 2);
    }
  }

  /**
   * Clear the waveform canvas and invalidate cached metrics
   */
  clearWaveform() {
    const canvas = this.elements.waveformCanvas;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.waveformMetrics = null;
  }

  /**
   * Smooth playhead animation while audio plays. Skipped when the user
   * prefers reduced motion (the ~4 Hz timeupdate redraws still show
   * coarse progress) or the waveform is hidden.
   */
  startPlayheadLoop() {
    if (this.rafId !== null) return;
    if (this.reducedMotion.matches || !this.settings.showWaveform) return;

    const tick = () => {
      this.drawWaveform(this.getPlaybackProgress());
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stopPlayheadLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Seek by clicking/tapping the waveform
   */
  handleWaveformSeek(e) {
    const duration = this.audioElement.duration;
    if (!duration || !isFinite(duration)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;

    const fraction = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    this.audioElement.currentTime = fraction * duration;
    this.elements.seekBar.value = fraction * 100;
    this.updateSeekBarFill(fraction * 100);
    if (this.settings.showWaveform) {
      this.drawWaveform(fraction);
    }
  }

  /**
   * Paint the seek bar's filled portion (range inputs have no native fill)
   */
  updateSeekBarFill(percent) {
    this.elements.seekBar.style.background =
      `linear-gradient(90deg, var(--indigo-400) 0%, var(--cyan-400) ${percent}%, var(--gray-700) ${percent}%)`;
  }

  /**
   * Current playback position as a 0..1 fraction
   */
  getPlaybackProgress() {
    const duration = this.audioElement.duration;
    if (!duration || !isFinite(duration)) return 0;
    return this.audioElement.currentTime / duration;
  }

  /**
   * Handle format selection — opens the naming dialog; the conversion
   * itself runs in confirmDownload() once the title is confirmed.
   */
  handleFormatSelect(button) {
    // Ignore clicks while a conversion is already running
    if (this.isConverting) return;

    this.pendingFormat = button.dataset.format;
    this.pendingFormatBtn = button;
    this.openNameDialog();
  }

  /**
   * Open the naming dialog for the pending format
   */
  openNameDialog() {
    const format = this.pendingFormat;
    this.elements.nameDialogFormat.textContent =
      format === 'aac' ? 'AAC (.m4a)' : format.toUpperCase();
    this.elements.trackTitleInput.value = this.trackTitle;
    this.updateNamePreview();
    this.elements.nameDialog.classList.remove('hidden');
    this.elements.trackTitleInput.focus();
    this.elements.trackTitleInput.select();
  }

  /**
   * Close the naming dialog, restoring focus to the triggering button
   */
  closeNameDialog() {
    if (this.elements.nameDialog.classList.contains('hidden')) return;
    this.elements.nameDialog.classList.add('hidden');
    if (this.pendingFormatBtn) this.pendingFormatBtn.focus();
    this.pendingFormat = null;
    this.pendingFormatBtn = null;
  }

  /**
   * Strip filesystem-hostile characters from a user-supplied title
   */
  sanitizeFileName(name) {
    const cleaned = (name || '')
      .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 120)
      .trim();
    // Windows reserves these device names even as bare filenames
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) {
      return `_${cleaned}`;
    }
    return cleaned || 'audio';
  }

  /**
   * Compact key token from analysis: "F#m" (minor) / "F#" (major)
   */
  formatKeyToken(key) {
    if (!key || !key.key) return '';
    return key.key + (key.mode === 'minor' ? KEY_MINOR_SUFFIX : KEY_MAJOR_SUFFIX);
  }

  /**
   * Build "[Name] - [BPM]bpm - [KEY].[ext]", omitting missing segments
   */
  buildDownloadName(format) {
    const metadata = this.currentResult?.metadata || this.processor?.metadata || null;
    const title = this.sanitizeFileName(
      this.elements.trackTitleInput.value || this.trackTitle
    );

    const parts = [title];
    if (metadata?.tempo?.bpm) parts.push(`${metadata.tempo.bpm}bpm`);
    const keyToken = this.formatKeyToken(metadata?.key);
    if (keyToken) parts.push(keyToken);

    const extension = format === 'aac' ? 'm4a' : format;
    return `${parts.join(' - ')}.${extension}`;
  }

  /**
   * Live filename preview inside the naming dialog
   */
  updateNamePreview() {
    if (!this.pendingFormat) return;
    this.elements.namePreview.textContent = this.buildDownloadName(this.pendingFormat);
  }

  /**
   * Default title for a freshly loaded track:
   * resolved page title > source filename > 'audio'
   */
  deriveDefaultTitle() {
    if (this.processor?.pageTitle) {
      return this.sanitizeFileName(this.processor.pageTitle);
    }
    const sourceName = this.processor?.currentFile?.name;
    if (sourceName) {
      const base = sourceName.replace(/\.[^/.]+$/, '');
      if (base && base !== 'media' && base !== 'input') {
        return this.sanitizeFileName(base);
      }
    }
    return 'audio';
  }

  /**
   * Convert to the pending format and download under the confirmed name
   */
  async confirmDownload() {
    if (this.isConverting) return;
    const format = this.pendingFormat;
    const button = this.pendingFormatBtn;
    if (!format || !button) return;

    this.trackTitle = this.elements.trackTitleInput.value.trim();
    const fileName = this.buildDownloadName(format);
    this.closeNameDialog();

    this.isConverting = true;

    // Update UI
    this.elements.formatBtns.forEach(btn => {
      btn.classList.remove('selected');
      btn.disabled = true;
    });
    button.classList.add('selected');
    button.disabled = false;

    // Show download progress
    this.elements.downloadProgress.classList.remove('hidden');
    this.elements.downloadStatus.textContent = `Converting to ${format.toUpperCase()}...`;
    this.elements.downloadBarFill.style.width = '0%';

    // Save the original progress callback
    const originalOnProgress = this.processor.onProgress;

    try {
      // Temporarily override progress callback for download bar
      this.processor.onProgress = (percent) => {
        this.elements.downloadBarFill.style.width = `${percent}%`;
      };

      // Convert
      const result = await this.processor.convertToFormat(format);

      this.elements.downloadStatus.textContent = `Ready: ${fileName}`;
      this.elements.downloadBarFill.style.width = '100%';

      // Trigger download under the user-confirmed name
      this.downloadFile(result.blob, fileName);

      // Hide progress after delay
      setTimeout(() => {
        this.elements.downloadProgress.classList.add('hidden');
        button.classList.remove('selected');
      }, 1500);

      this.showToast('Download started!', 'success');

    } catch (error) {
      console.error('Conversion error:', error);
      this.showToast('Conversion failed: ' + error.message, 'error');
      this.elements.downloadProgress.classList.add('hidden');
      button.classList.remove('selected');
    } finally {
      // Restore the original progress callback
      this.processor.onProgress = originalOnProgress;
      this.isConverting = false;
      this.elements.formatBtns.forEach(btn => { btn.disabled = false; });
    }
  }

  /**
   * Download file
   */
  downloadFile(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Toggle playback
   */
  togglePlayback() {
    // The audio element's play/pause events keep isPlaying, the button
    // state, and the playhead loop in sync (incl. OS media controls)
    if (this.isPlaying) {
      this.audioElement.pause();
    } else {
      this.audioElement.play().catch((error) => {
        console.error('[reSOURCERY] Playback failed:', error);
        this.isPlaying = false;
        this.elements.playBtn.classList.remove('playing');
        this.showToast('Playback failed. Please try again.', 'error');
      });
    }
  }

  /**
   * Handle seek
   */
  handleSeek(e) {
    const duration = this.audioElement.duration;
    if (!duration || !isFinite(duration)) return;
    const percent = e.target.value / 100;
    this.audioElement.currentTime = percent * duration;
    this.updateSeekBarFill(e.target.value);
    if (this.settings.showWaveform) {
      this.drawWaveform(percent);
    }
  }

  /**
   * Update time display
   */
  updateTimeDisplay() {
    const current = this.audioElement.currentTime;
    const duration = this.audioElement.duration;

    this.elements.currentTime.textContent = this.formatTime(current);
    if (duration && isFinite(duration)) {
      const percent = (current / duration) * 100;
      this.elements.seekBar.value = percent;
      this.updateSeekBarFill(percent);
      // While the rAF loop runs it owns the redraws — avoid double drawing
      if (this.settings.showWaveform && this.rafId === null) {
        this.drawWaveform(current / duration);
      }
    }
  }

  /**
   * Handle audio loaded
   */
  handleAudioLoaded() {
    this.elements.totalTime.textContent = this.formatTime(this.audioElement.duration);
  }

  /**
   * Handle playback end
   */
  handlePlaybackEnd() {
    this.isPlaying = false;
    this.stopPlayheadLoop();
    this.elements.playBtn.classList.remove('playing');
    this.elements.seekBar.value = 0;
    this.updateSeekBarFill(0);
    if (this.settings.showWaveform) {
      this.drawWaveform(0);
    }
  }

  /**
   * Cancel processing
   */
  cancelProcessing() {
    // Reset processor state
    if (this.processor) {
      this.processor.destroy();
      this.initAudioProcessor();
    }

    this.resetToUpload();
    this.showToast('Processing cancelled', 'info');
  }

  /**
   * Reset to upload section
   */
  resetToUpload() {
    this.showSection('upload');
    this.elements.urlInput.value = '';
    this.elements.fileInput.value = '';
    this.currentResult = null;

    // Stop any playing audio and revoke object URL
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
    }
    if (this.audioObjectURL) {
      URL.revokeObjectURL(this.audioObjectURL);
      this.audioObjectURL = null;
    }
    this.isPlaying = false;
    this.stopPlayheadLoop();
    this.waveformMetrics = null;
    this.elements.playBtn.classList.remove('playing');
    this.elements.seekBar.value = 0;
    this.updateSeekBarFill(0);
  }

  /**
   * Show section
   */
  showSection(section) {
    this.elements.uploadSection.classList.toggle('hidden', section !== 'upload');
    this.elements.processingSection.classList.toggle('hidden', section !== 'processing');
    this.elements.resultsSection.classList.toggle('hidden', section !== 'results');
  }

  /**
   * Reset progress
   */
  resetProgress() {
    this.elements.progressFill.style.width = '0%';
    this.elements.progressFill.style.background = '';
    this.elements.progressPercent.textContent = '0%';
    this.elements.progressStage.textContent = 'Initializing...';

    // Reset ring indicator
    if (this.elements.stageRingFill) {
      this.elements.stageRingFill.style.strokeDashoffset = '276.5';
      this.elements.stageRingFill.style.stroke = '#4455aa';
    }
    if (this.elements.stageIconInner) {
      this.elements.stageIconInner.dataset.stage = 'download';
      this.elements.stageIconInner.style.color = '#4455aa';
    }

    // Reset steps
    Object.values(this.elements.steps).forEach(step => {
      step.classList.remove('active', 'completed');
    });
  }

  /**
   * Update progress
   */
  updateProgress(percent) {
    this.elements.progressFill.style.width = `${percent}%`;
    this.elements.progressPercent.textContent = `${percent}%`;
    this.updateRingProgress(percent);
  }

  /**
   * Update the circular ring indicator progress and color
   */
  updateRingProgress(percent) {
    if (!this.elements.stageRingFill) return;

    const circumference = 276.5; // 2 * π * 44
    const offset = circumference - (percent / 100) * circumference;
    this.elements.stageRingFill.style.strokeDashoffset = offset;

    // Color transition: indigo (0%) → cyan (50%) → bright teal (100%)
    const color = this.getProgressColor(percent);
    this.elements.stageRingFill.style.stroke = color;

    if (this.elements.stageIconInner) {
      this.elements.stageIconInner.style.color = color;
    }

    // Also tint the linear progress bar
    this.elements.progressFill.style.background =
      `linear-gradient(90deg, var(--indigo-500), ${color})`;
  }

  /**
   * Get interpolated color based on progress percentage
   */
  getProgressColor(percent) {
    if (percent <= 50) {
      return this.lerpColor('#4455aa', '#32b4c4', percent / 50);
    }
    return this.lerpColor('#32b4c4', '#5ce6d6', (percent - 50) / 50);
  }

  /**
   * Linear interpolate between two hex colors
   */
  lerpColor(a, b, t) {
    const ar = parseInt(a.slice(1, 3), 16);
    const ag = parseInt(a.slice(3, 5), 16);
    const ab = parseInt(a.slice(5, 7), 16);
    const br = parseInt(b.slice(1, 3), 16);
    const bg = parseInt(b.slice(3, 5), 16);
    const bb = parseInt(b.slice(5, 7), 16);
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
  }

  /**
   * Update stage
   */
  updateStage(stage) {
    this.elements.progressStage.textContent = stage;
    this.updateStageIcon(stage);
  }

  /**
   * Update the stage indicator icon based on current processing stage
   */
  updateStageIcon(stage) {
    if (!this.elements.stageIconInner) return;

    const s = stage.toLowerCase();
    let iconType = 'download';

    if (s.includes('complete') || s.includes('ready')) {
      iconType = 'check';
    } else if (s.includes('tempo') || s.includes('key')) {
      iconType = 'music';
    } else if (s.includes('extract') || s.includes('analyz') || s.includes('detect')) {
      iconType = 'waveform';
    } else if (s.includes('loading media') || s.includes('fetching') || s.includes('processing')) {
      iconType = 'file';
    }

    this.elements.stageIconInner.dataset.stage = iconType;
  }

  /**
   * Set step active
   */
  setStepActive(stepId) {
    this.elements.steps[stepId].classList.add('active');
    this.elements.steps[stepId].classList.remove('completed');
  }

  /**
   * Set step completed
   */
  setStepCompleted(stepId) {
    this.elements.steps[stepId].classList.remove('active');
    this.elements.steps[stepId].classList.add('completed');
  }

  /**
   * Toggle settings panel
   */
  toggleSettings(show) {
    this.elements.settingsPanel.classList.toggle('hidden', !show);
  }

  /**
   * Load settings from localStorage
   */
  loadSettings() {
    const saved = localStorage.getItem('resourcerySettings');
    if (saved) {
      try {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }

    // Apply to UI
    this.elements.preserveSampleRate.checked = this.settings.preserveSampleRate;
    this.elements.autoDetectMusic.checked = this.settings.autoDetectMusic;
    this.elements.showWaveform.checked = this.settings.showWaveform;
  }

  /**
   * Inject version from centralized APP_VERSION config into DOM elements
   */
  injectVersion() {
    if (typeof APP_VERSION !== 'undefined') {
      if (this.elements.versionBadge) {
        this.elements.versionBadge.textContent = APP_VERSION.short;
      }
      if (this.elements.settingsVersion) {
        this.elements.settingsVersion.textContent = APP_VERSION.display;
      }
    }
  }

  /**
   * Save settings to localStorage
   */
  saveSettings() {
    localStorage.setItem('resourcerySettings', JSON.stringify(this.settings));
  }

  /**
   * Show toast notification - uses DOM API to avoid innerHTML
   */
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';

    // Create icon span using DOM API
    const iconSpan = document.createElement('span');
    iconSpan.className = `toast-icon ${type}`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');

    const iconPaths = {
      success: '<polyline points="20 6 9 17 4 12"></polyline>',
      error: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
      info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
    };

    svg.innerHTML = iconPaths[type] || iconPaths.info;

    iconSpan.appendChild(svg);
    toast.appendChild(iconSpan);

    // Create message span using textContent (safe from XSS)
    const messageSpan = document.createElement('span');
    messageSpan.className = 'toast-message';
    messageSpan.textContent = message;
    toast.appendChild(messageSpan);

    this.elements.toastContainer.appendChild(toast);

    // Remove after delay — errors linger longer so they can be read
    const duration = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /**
   * Format file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration
   */
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format time
   */
  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Extract filename from URL
   */
  extractFileName(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      const match = path.match(/\/([^/]+)$/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize app
const app = new ReSOURCERYApp();

// Export for debugging
if (typeof window !== 'undefined') {
  window.ReSOURCERYApp = ReSOURCERYApp;
  window.app = app;
}
