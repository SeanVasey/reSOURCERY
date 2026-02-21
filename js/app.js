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

class ReSOURCERYApp {
  constructor() {
    // State
    this.processor = null;
    this.audioElement = null;
    this.isPlaying = false;
    this.currentResult = null;
    this.waveformData = [];
    this.audioObjectURL = null;

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
    this.elements.urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleURLSubmit();
    });

    // File drop zone
    this.elements.dropZone.addEventListener('click', () => this.elements.fileInput.click());
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

    // Format buttons
    this.elements.formatBtns.forEach(btn => {
      btn.addEventListener('click', () => this.handleFormatSelect(btn));
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

    // Revoke previous audio URL if any
    if (this.audioObjectURL) {
      URL.revokeObjectURL(this.audioObjectURL);
    }

    // Create audio blob for playback
    const wavBlob = new Blob([result.wavData], { type: 'audio/wav' });
    this.audioObjectURL = URL.createObjectURL(wavBlob);
    this.audioElement.src = this.audioObjectURL;

    // Draw waveform
    if (this.settings.showWaveform) {
      this.drawWaveform();
    }

    // Show results section
    this.showSection('results');
  }

  /**
   * Draw waveform visualization
   */
  drawWaveform() {
    const canvas = this.elements.waveformCanvas;
    const ctx = canvas.getContext('2d');

    // Set canvas size
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw waveform
    const barWidth = width / this.waveformData.length;
    const centerY = height / 2;

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(34, 211, 238, 0.8)');
    gradient.addColorStop(0.5, 'rgba(13, 148, 136, 0.6)');
    gradient.addColorStop(1, 'rgba(34, 211, 238, 0.8)');

    ctx.fillStyle = gradient;

    for (let i = 0; i < this.waveformData.length; i++) {
      const value = this.waveformData[i];
      const barHeight = value * height * 0.8;

      ctx.fillRect(
        i * barWidth,
        centerY - barHeight / 2,
        barWidth - 1,
        barHeight
      );
    }
  }

  /**
   * Handle format selection
   */
  async handleFormatSelect(button) {
    const format = button.dataset.format;

    // Update UI
    this.elements.formatBtns.forEach(btn => btn.classList.remove('selected'));
    button.classList.add('selected');

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

      this.elements.downloadStatus.textContent = 'Download ready!';
      this.elements.downloadBarFill.style.width = '100%';

      // Trigger download
      this.downloadFile(result.blob, result.fileName);

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
    if (this.isPlaying) {
      this.audioElement.pause();
      this.isPlaying = false;
      this.elements.playBtn.classList.remove('playing');
    } else {
      this.audioElement.play();
      this.isPlaying = true;
      this.elements.playBtn.classList.add('playing');
    }
  }

  /**
   * Handle seek
   */
  handleSeek(e) {
    const percent = e.target.value / 100;
    this.audioElement.currentTime = percent * this.audioElement.duration;
  }

  /**
   * Update time display
   */
  updateTimeDisplay() {
    const current = this.audioElement.currentTime;
    const duration = this.audioElement.duration;

    this.elements.currentTime.textContent = this.formatTime(current);
    this.elements.seekBar.value = (current / duration) * 100;
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
    this.elements.playBtn.classList.remove('playing');
    this.elements.seekBar.value = 0;
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
    this.elements.playBtn.classList.remove('playing');
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

    // Remove after delay
    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
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
