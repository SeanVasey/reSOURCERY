const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('js/audio-processor.js', 'utf8');
const context = {
  console,
  setTimeout,
  clearTimeout,
  URL,
  Blob,
};
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.AudioProcessor = AudioProcessor;`, context);

const processor = new context.AudioProcessor({ useWebWorker: false });
assert.strictEqual(processor.ffmpegCoreConfig.workerURL, null, 'single-threaded @ffmpeg/core must not fetch a missing worker script');
assert.match(processor.ffmpegCoreConfig.coreURL, /@ffmpeg\/core@0\.12\.6/);
assert.match(processor.ffmpegCoreConfig.wasmURL, /@ffmpeg\/core@0\.12\.6/);

console.log('audio processor FFmpeg core configuration is valid');
