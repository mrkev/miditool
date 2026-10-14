import { computeColumns } from "./spectrogram";

export interface SpectrogramJob {
  samples: Float32Array;
  sampleOffset: number;
  sampleRate: number;
  hop: number;
  frameStart: number;
  frameEnd: number;
}

export type SpectrogramWorkerMessage =
  { type: "progress"; progress: number } | { type: "done"; data: Float32Array };

self.onmessage = (e: MessageEvent<SpectrogramJob>) => {
  const { samples, sampleOffset, sampleRate, hop, frameStart, frameEnd } =
    e.data;
  const data = computeColumns(
    samples,
    sampleOffset,
    sampleRate,
    hop,
    frameStart,
    frameEnd,
    (progress) =>
      postMessage({
        type: "progress",
        progress,
      } satisfies SpectrogramWorkerMessage),
  );
  postMessage({ type: "done", data } satisfies SpectrogramWorkerMessage, {
    transfer: [data.buffer],
  });
};
