import {
  MAX_FFT_HALF,
  NUM_ROWS,
  planSpectrogram,
  toDecibels,
  type Spectrogram,
} from "./spectrogram";
import type {
  SpectrogramJob,
  SpectrogramWorkerMessage,
} from "./spectrogram.worker";

/** Mixes an AudioBuffer down to mono */
export function toMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < mono.length; i++) {
      mono[i] += channel[i] / buffer.numberOfChannels;
    }
  }
  return mono;
}

/**
 * Computes a spectrogram across a pool of workers, each taking a contiguous
 * range of frames. Rejects with an AbortError if `signal` aborts.
 */
export async function analyze(
  samples: Float32Array,
  sampleRate: number,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<Spectrogram> {
  const { hop, width } = planSpectrogram(samples.length, sampleRate);
  const numWorkers = Math.max(
    1,
    Math.min(navigator.hardwareConcurrency || 4, 8, Math.ceil(width / 64)),
  );
  const progress = new Array<number>(numWorkers).fill(0);
  const workers: Worker[] = [];
  const terminate = () => workers.forEach((worker) => worker.terminate());
  signal.addEventListener("abort", terminate);

  const chunks = Array.from({ length: numWorkers }, (_, i) => {
    const frameStart = Math.floor((width * i) / numWorkers);
    const frameEnd = Math.floor((width * (i + 1)) / numWorkers);
    return { frameStart, frameEnd };
  });

  try {
    const results = await Promise.all(
      chunks.map(
        ({ frameStart, frameEnd }, i) =>
          new Promise<Float32Array>((resolve, reject) => {
            const worker = new Worker(
              new URL("./spectrogram.worker.ts", import.meta.url),
              { type: "module" },
            );
            workers.push(worker);
            signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
            worker.onerror = (e) => reject(new Error(e.message));
            worker.onmessage = (e: MessageEvent<SpectrogramWorkerMessage>) => {
              if (e.data.type === "progress") {
                progress[i] = e.data.progress;
                onProgress(progress.reduce((a, b) => a + b, 0) / numWorkers);
              } else {
                resolve(e.data.data);
              }
            };

            // Only send the samples this chunk reads
            const sampleStart = Math.max(0, frameStart * hop - MAX_FFT_HALF);
            const sampleEnd = Math.min(
              samples.length,
              frameEnd * hop + MAX_FFT_HALF,
            );
            worker.postMessage({
              samples: samples.slice(sampleStart, sampleEnd),
              sampleOffset: sampleStart,
              sampleRate,
              hop,
              frameStart,
              frameEnd,
            } satisfies SpectrogramJob);
          }),
      ),
    );

    // Stitch the column ranges back together
    const data = new Float32Array(width * NUM_ROWS);
    results.forEach((chunk, i) => {
      const { frameStart, frameEnd } = chunks[i];
      const chunkWidth = frameEnd - frameStart;
      for (let row = 0; row < NUM_ROWS; row++) {
        data.set(
          chunk.subarray(row * chunkWidth, (row + 1) * chunkWidth),
          row * width + frameStart,
        );
      }
    });
    toDecibels(data);

    return {
      width,
      height: NUM_ROWS,
      frameDuration: hop / sampleRate,
      sampleRate,
      data,
    };
  } finally {
    terminate();
    signal.removeEventListener("abort", terminate);
  }
}
