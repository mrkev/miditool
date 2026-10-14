// Pitch-scaled spectrogram. Rows are evenly spaced in pitch (ie. log
// frequency), so they line up with piano roll rows.

/** A0 */
export const MIN_NOTE = 21;
/** C8 */
export const MAX_NOTE = 108;
export const ROWS_PER_SEMITONE = 4;
export const NUM_ROWS = (MAX_NOTE - MIN_NOTE + 1) * ROWS_PER_SEMITONE;

/** Upper bound on frames, so the spectrogram fits in a single canvas */
const MAX_FRAMES = 16384;
const TARGET_FRAMES_PER_SECOND = 100;

export interface Spectrogram {
  /** Number of frames (columns) */
  width: number;
  /** Number of pitch rows, row 0 is the highest pitch */
  height: number;
  /** Seconds between frames */
  frameDuration: number;
  sampleRate: number;
  /** Magnitude in dB relative to the loudest bin (<= 0), row-major */
  data: Float32Array;
}

export function midiToFrequency(note: number) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** Pitch at the center of row `row` (row 0 = highest) */
export function rowToPitch(row: number) {
  return MAX_NOTE + 0.5 - (row + 0.5) / ROWS_PER_SEMITONE;
}

/**
 * Analysis resolutions, like a coarse constant-Q transform. Longer windows
 * resolve low notes, shorter ones keep high notes sharp in time. Each row
 * uses the shortest window whose bins are at least `MIN_BINS_PER_SEMITONE`
 * per semitone at that pitch.
 *
 * Long windows run on a decimated copy of the signal (low notes don't need
 * the high sample rate), so every band costs at most a 4096-point FFT.
 */
const BANDS = [
  { decimation: 0, size: 2048 },
  { decimation: 0, size: 4096 },
  { decimation: 1, size: 4096 },
  { decimation: 2, size: 4096 },
  { decimation: 3, size: 4096 },
  { decimation: 4, size: 4096 },
].map((band) => ({ ...band, window: band.size << band.decimation }));
type Band = (typeof BANDS)[number];
const MIN_BINS_PER_SEMITONE = 2;
const MAX_DECIMATION = Math.max(...BANDS.map((band) => band.decimation));

export interface SpectrogramPlan {
  /** Samples between frames */
  hop: number;
  /** Total number of frames */
  width: number;
}

export function planSpectrogram(
  numSamples: number,
  sampleRate: number,
): SpectrogramPlan {
  const hop = Math.max(
    Math.round(sampleRate / TARGET_FRAMES_PER_SECOND),
    Math.ceil(numSamples / MAX_FRAMES),
  );
  return { hop, width: Math.max(1, Math.ceil(numSamples / hop)) };
}

function bandForPitch(pitch: number, sampleRate: number): Band {
  const semitoneHz =
    midiToFrequency(pitch + 0.5) - midiToFrequency(pitch - 0.5);
  return (
    BANDS.find(
      (band) =>
        semitoneHz / (sampleRate / band.window) >= MIN_BINS_PER_SEMITONE,
    ) ?? BANDS[BANDS.length - 1]
  );
}

/** Analysis window length, in samples, used for rows around `pitch` */
export function fftSizeForPitch(pitch: number, sampleRate: number) {
  return bandForPitch(pitch, sampleRate).window;
}

/**
 * Lowpass FIR used before each 2x decimation: windowed sinc (Blackman)
 * cutting off at 0.2 cycles/sample, below the new Nyquist of 0.25.
 */
const DECIMATION_FILTER = (() => {
  const taps = 31;
  const cutoff = 0.2;
  const h = new Float32Array(taps);
  const mid = (taps - 1) / 2;
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - mid;
    const sinc =
      x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
    const blackman =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) +
      0.08 * Math.cos((4 * Math.PI * i) / (taps - 1));
    h[i] = sinc * blackman;
    sum += h[i];
  }
  // Unity gain at DC, so levels match across bands
  return h.map((v) => v / sum);
})();

/** Samples on each side of a frame's center that computing it reads */
export const MAX_FFT_HALF =
  Math.max(...BANDS.map((band) => band.window)) / 2 +
  // Filter support accumulated over the decimation stages
  (DECIMATION_FILTER.length << MAX_DECIMATION);

/** A signal at some decimation level; `start` is its first sample's index */
interface Level {
  data: Float32Array;
  start: number;
}

/**
 * Lowpass filters and halves the sample rate. Sample j of the result sits
 * at sample 2j of the input, so levels stay aligned to absolute positions.
 */
function decimate({ data, start }: Level): Level {
  const h = DECIMATION_FILTER;
  const mid = (h.length - 1) / 2;
  const outStart = Math.ceil(start / 2);
  const outEnd = Math.floor((start + data.length - 1) / 2);
  const out = new Float32Array(Math.max(0, outEnd - outStart + 1));
  for (let j = outStart; j <= outEnd; j++) {
    const center = 2 * j - start;
    let acc = 0;
    for (let k = 0; k < h.length; k++) {
      const i = center + k - mid;
      if (i >= 0 && i < data.length) acc += h[k] * data[i];
    }
    out[j - outStart] = acc;
  }
  return { data: out, start: outStart };
}

/**
 * Computes linear magnitudes for frames [frameStart, frameEnd). `samples`
 * holds the audio starting at absolute sample `sampleOffset`. Returns a
 * row-major array `NUM_ROWS` tall and `frameEnd - frameStart` wide.
 */
export function computeColumns(
  samples: Float32Array,
  sampleOffset: number,
  sampleRate: number,
  hop: number,
  frameStart: number,
  frameEnd: number,
  onProgress?: (progress: number) => void,
): Float32Array {
  const width = frameEnd - frameStart;
  const data = new Float32Array(width * NUM_ROWS);

  // Assign each row to a band
  const rowsByBand = new Map<Band, number[]>();
  for (let row = 0; row < NUM_ROWS; row++) {
    const band = bandForPitch(rowToPitch(row), sampleRate);
    const rows = rowsByBand.get(band) ?? [];
    rows.push(row);
    rowsByBand.set(band, rows);
  }

  // Decimated copies of the signal, as needed
  const levels: Level[] = [{ data: samples, start: sampleOffset }];
  const maxLevel = Math.max(...[...rowsByBand.keys()].map((b) => b.decimation));
  for (let l = 1; l <= maxLevel; l++) {
    levels.push(decimate(levels[l - 1]));
  }

  const totalWork = [...rowsByBand.keys()].reduce((a, b) => a + b.size, 0);
  let doneWork = 0;

  for (const [band, rows] of rowsByBand) {
    const { size, decimation } = band;
    const level = levels[decimation];
    const fft = new FFT(size);
    const window = hann(size);
    const re = new Float32Array(size);
    const im = new Float32Array(size);
    const binHz = sampleRate / (size << decimation);

    // Frequency range (in bins) covered by each row
    const ranges = rows.map((row) => {
      const pitch = rowToPitch(row);
      const step = 0.5 / ROWS_PER_SEMITONE;
      return {
        row,
        center: midiToFrequency(pitch) / binHz,
        lo: midiToFrequency(pitch - step) / binHz,
        hi: midiToFrequency(pitch + step) / binHz,
      };
    });
    // Only need magnitudes up to the highest bin any row reads
    const numBins = Math.min(
      size / 2 + 1,
      Math.ceil(Math.max(...ranges.map((r) => r.hi))) + 2,
    );
    const mags = new Float32Array(numBins);

    for (let frame = frameStart; frame < frameEnd; frame++) {
      // Frames are centered on frame * hop
      const center = Math.round((frame * hop) / (1 << decimation));
      const offset = center - size / 2 - level.start;
      for (let i = 0; i < size; i++) {
        const j = offset + i;
        re[i] = j >= 0 && j < level.data.length ? level.data[j] * window[i] : 0;
        im[i] = 0;
      }
      fft.transform(re, im);
      for (let k = 0; k < numBins; k++) {
        mags[k] = Math.hypot(re[k], im[k]);
      }

      const column = frame - frameStart;
      for (const { row, center, lo, hi } of ranges) {
        let mag: number;
        if (hi - lo < 1) {
          // Row narrower than a bin: interpolate
          const k = Math.min(Math.floor(center), numBins - 2);
          const frac = center - k;
          mag = mags[k] * (1 - frac) + mags[k + 1] * frac;
        } else {
          // Row spans several bins: take the strongest
          mag = 0;
          const last = Math.min(Math.floor(hi), numBins - 1);
          for (let k = Math.ceil(lo); k <= last; k++) {
            mag = Math.max(mag, mags[k]);
          }
        }
        // Normalize by window size so resolutions are comparable
        data[row * width + column] = mag / size;
      }

      if (onProgress && column % 64 === 0) {
        onProgress((doneWork + (size * column) / width) / totalWork);
      }
    }
    doneWork += size;
  }

  return data;
}

/** Converts linear magnitudes in-place to dB relative to the loudest point */
export function toDecibels(data: Float32Array) {
  let max = 1e-12;
  for (let i = 0; i < data.length; i++) {
    max = Math.max(max, data[i]);
  }
  for (let i = 0; i < data.length; i++) {
    data[i] = 20 * Math.log10(Math.max(data[i], 1e-12) / max);
  }
}

function hann(size: number) {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  }
  return window;
}

/** In-place iterative radix-2 FFT */
class FFT {
  private readonly size: number;
  private readonly reverse: Uint32Array;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;

  constructor(size: number) {
    this.size = size;
    const bits = Math.log2(size);
    this.reverse = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) {
        r = (r << 1) | ((i >> b) & 1);
      }
      this.reverse[i] = r;
    }
    this.cos = new Float32Array(size / 2);
    this.sin = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size);
    }
  }

  transform(re: Float32Array, im: Float32Array) {
    const { size, reverse, cos, sin } = this;
    for (let i = 0; i < size; i++) {
      const j = reverse[i];
      if (j > i) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      const step = size / len;
      for (let start = 0; start < size; start += len) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step];
          const wi = sin[k * step];
          const a = start + k;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  }
}
