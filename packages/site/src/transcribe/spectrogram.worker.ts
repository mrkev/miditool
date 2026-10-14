import { computeColumns, type SpectrogramJob } from "./spectrogram";

export type SpectrogramWorkerMessage =
  { type: "progress"; progress: number } | { type: "done"; data: Float32Array };

self.onmessage = (e: MessageEvent<SpectrogramJob>) => {
  const data = computeColumns(e.data, (progress) =>
    postMessage({
      type: "progress",
      progress,
    } satisfies SpectrogramWorkerMessage),
  );
  postMessage({ type: "done", data } satisfies SpectrogramWorkerMessage, {
    transfer: [data.buffer],
  });
};
