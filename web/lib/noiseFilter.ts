/**
 * RNNoise-based audio noise suppression utility
 * Filters out background noise to improve speech recognition accuracy
 * Uses @jitsi/rnnoise-wasm for WebAssembly-based noise suppression
 */

interface RNNoiseState {
  id: number;
  process: (pcmData: Float32Array) => Float32Array;
  free: () => void;
}

let rnnoiseModule: any = null;
let rnnoiseInitialized = false;
let initPromise: Promise<void> | null = null;

const FRAME_SIZE = 480; // RNNoise expects 480 samples per frame (10ms at 48kHz)

/**
 * Initialize RNNoise WASM module
 */
async function initializeRNNoise(): Promise<void> {
  if (rnnoiseInitialized && rnnoiseModule) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = new Promise(async (resolve, reject) => {
    try {
      // Dynamically import the Jitsi RNNoise WASM module
      // @ts-ignore - suppress Turbopack dynamic import warning
      const rnnoiseWasm = await import('@jitsi/rnnoise-wasm');
      const { RNNoise } = rnnoiseWasm;
      
      // Initialize the RNNoise module
      rnnoiseModule = await RNNoise();
      rnnoiseInitialized = true;
      
      console.log('✅ RNNoise WASM initialized successfully');
      resolve();
    } catch (error) {
      console.error('❌ Failed to initialize RNNoise:', error);
      rnnoiseInitialized = false;
      reject(error);
    }
  });

  return initPromise;
}

/**
 * Process audio frame through RNNoise filter
 * @param audioData - Float32Array of audio samples
 * @returns Filtered Float32Array
 */
export function processAudioFrame(audioData: Float32Array): Float32Array {
  if (!rnnoiseModule || !rnnoiseInitialized) {
    console.warn('⚠️ RNNoise not initialized, returning original audio');
    return audioData;
  }

  try {
    // Create a new RNNoise instance for this frame
    const denoiser = rnnoiseModule.createDenoiser();
    
    // Process the audio frame
    const processedFrame = denoiser.process(audioData.slice(0, FRAME_SIZE));
    
    // Clean up
    denoiser.free();

    return processedFrame;
  } catch (error) {
    console.error('❌ Error processing audio frame:', error);
    return audioData; // Return original if filtering fails
  }
}

/**
 * Process audio data in chunks
 * Useful for processing longer audio segments
 * @param audioData - Float32Array of audio samples
 * @returns Filtered Float32Array
 */
export function processAudioData(audioData: Float32Array): Float32Array {
  if (!rnnoiseModule || !rnnoiseInitialized) {
    return audioData;
  }

  try {
    const denoiser = rnnoiseModule.createDenoiser();
    const output = new Float32Array(audioData.length);
    
    // Process in FRAME_SIZE chunks
    for (let i = 0; i < audioData.length; i += FRAME_SIZE) {
      const chunk = audioData.slice(i, Math.min(i + FRAME_SIZE, audioData.length));
      
      // Pad if necessary
      let processChunk = chunk;
      if (chunk.length < FRAME_SIZE) {
        processChunk = new Float32Array(FRAME_SIZE);
        processChunk.set(chunk);
      }

      const filtered = denoiser.process(processChunk);
      output.set(filtered.slice(0, chunk.length), i);
    }

    denoiser.free();
    return output;
  } catch (error) {
    console.error('❌ Error processing audio data:', error);
    return audioData;
  }
}

/**
 * Get RNNoise initialization status
 */
export function isRNNoiseReady(): boolean {
  return rnnoiseInitialized && rnnoiseModule !== null;
}

/**
 * Initialize RNNoise and return a promise
 */
export async function ensureRNNoiseInitialized(): Promise<void> {
  return initializeRNNoise();
}

/**
 * Get frame size constant
 */
export function getFrameSize(): number {
  return FRAME_SIZE;
}

/**
 * Create an audio processor that applies RNNoise filtering
 * Useful for real-time audio processing
 */
export class RNNoiseProcessor {
  private audioContext: AudioContext;
  private processor: ScriptProcessorNode | AudioWorkletNode | null = null;
  private isProcessing = false;
  private denoiser: RNNoiseState | null = null;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  /**
   * Initialize the processor
   */
  async initialize(): Promise<void> {
    await ensureRNNoiseInitialized();
    console.log('✅ RNNoiseProcessor initialized');
  }

  /**
   * Start processing audio
   */
  startProcessing(sourceNode: AudioNode, destinationNode: AudioNode): void {
    if (this.isProcessing) {
      console.warn('⚠️ Already processing audio');
      return;
    }

    if (!isRNNoiseReady()) {
      console.error('❌ RNNoise not ready');
      return;
    }

    try {
      // Create ScriptProcessorNode for real-time processing
      this.processor = this.audioContext.createScriptProcessor(FRAME_SIZE, 1, 1);
      
      // Create a denoiser instance for this processor
      if (rnnoiseModule) {
        this.denoiser = rnnoiseModule.createDenoiser();
      }

      this.processor.onaudioprocess = (event: AudioProcessingEvent) => {
        const input = event.inputBuffer.getChannelData(0);
        const output = event.outputBuffer.getChannelData(0);

        try {
          if (this.denoiser && isRNNoiseReady()) {
            const filtered = this.denoiser.process(new Float32Array(input));
            output.set(filtered);
          } else {
            output.set(input); // Fallback to original
          }
        } catch (error) {
          console.error('Error in audio processing:', error);
          output.set(input); // Fallback to original
        }
      };

      // Connect the processor
      sourceNode.connect(this.processor);
      this.processor.connect(destinationNode);

      this.isProcessing = true;
      console.log('✅ Audio processing with RNNoise started');
    } catch (error) {
      console.error('❌ Failed to start audio processing:', error);
    }
  }

  /**
   * Stop processing audio
   */
  stopProcessing(): void {
    if (!this.isProcessing || !this.processor) {
      return;
    }

    try {
      this.processor.disconnect();
      
      // Clean up denoiser
      if (this.denoiser) {
        this.denoiser.free();
        this.denoiser = null;
      }
      
      this.isProcessing = false;
      console.log('✅ Audio processing stopped');
    } catch (error) {
      console.error('❌ Error stopping audio processing:', error);
    }
  }

  /**
   * Check if processor is active
   */
  isActive(): boolean {
    return this.isProcessing;
  }
}
