declare module '@jitsi/rnnoise-wasm' {
  interface Denoiser {
    process(pcmData: Float32Array): Float32Array;
    free(): void;
  }

  interface RNNoiseModule {
    createDenoiser(): Denoiser;
  }

  function RNNoise(): Promise<RNNoiseModule>;
  export { RNNoise, RNNoiseModule, Denoiser };
}
