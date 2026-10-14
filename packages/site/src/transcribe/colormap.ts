import type { Spectrogram } from "./spectrogram";

// Approximation of matplotlib's "inferno"
const STOPS: [number, [number, number, number]][] = [
  [0, [0, 0, 4]],
  [0.2, [40, 11, 84]],
  [0.4, [101, 21, 110]],
  [0.6, [159, 42, 99]],
  [0.75, [212, 72, 66]],
  [0.88, [245, 125, 21]],
  [1, [252, 255, 164]],
];

const LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const s = STOPS.findIndex(([pos]) => pos >= t);
    const [p1, c1] = STOPS[Math.max(s, 1)];
    const [p0, c0] = STOPS[Math.max(s, 1) - 1];
    const f = (t - p0) / (p1 - p0);
    for (let c = 0; c < 3; c++) {
      lut[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * f;
    }
  }
  return lut;
})();

/**
 * Renders the spectrogram to a canvas, one pixel per frame and row. Values
 * below `floorDb` (relative to the loudest point) render black.
 */
export function renderSpectrogram(
  spectrogram: Spectrogram,
  floorDb: number,
  canvas = document.createElement("canvas"),
): HTMLCanvasElement {
  const { width, height, data } = spectrogram;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const pixels = image.data;
  for (let i = 0; i < data.length; i++) {
    const t = Math.min(1, Math.max(0, 1 - data[i] / floorDb));
    const c = Math.round(t * 255) * 3;
    pixels[i * 4] = LUT[c];
    pixels[i * 4 + 1] = LUT[c + 1];
    pixels[i * 4 + 2] = LUT[c + 2];
    pixels[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
