import { clampVelocity, type Note } from "./notes";
import {
  fftSizeForPitch,
  MAX_NOTE,
  MIN_NOTE,
  ROWS_PER_SEMITONE,
  type Spectrogram,
} from "./spectrogram";

// Simple polyphonic note detection over the spectrogram, meant as
// suggestions to accept or reject rather than a finished transcription.

const NUM_PITCHES = MAX_NOTE - MIN_NOTE + 1;
/** Semitone offsets and weights of the harmonics summed into a pitch */
const HARMONICS = [1, 2, 3, 4, 5, 6].map((h, i) => ({
  offset: Math.round(12 * Math.log2(h)),
  weight: Math.pow(0.75, i),
}));
const MIN_NOTE_SECONDS = 0.06;
/**
 * Long analysis windows smear energy before a note's onset and after its
 * end. Detected edges are pulled in by this fraction of the window length.
 */
const WINDOW_SMEAR = 0.25;
/**
 * The 2nd to 6th harmonics, as semitones above the fundamental. A pitch is
 * treated as an overtone when the pitch that far below is louder by
 * `marginDb`, which grows with the harmonic number because higher harmonics
 * are usually weaker. Notes played alongside at a similar level survive.
 */
const OVERTONES = [2, 3, 4, 5, 6].map((h) => ({
  offset: Math.round(12 * Math.log2(h)),
  marginDb: 4 * Math.log2(h),
}));
/**
 * dB a pitch must rise over the previous few frames, beyond its neighbours'
 * rise, to count as a re-attack. Comparing against neighbours ignores the
 * broadband smear of other notes' attacks.
 */
const ONSET_DB = 6;
const ONSET_LOOKBACK = 3;

/**
 * Rows used to time a note's onset: the note itself and its 2nd and 3rd
 * harmonics, as semitone offsets. Higher harmonics are analysed with shorter
 * windows, so they show the attack more sharply, but going higher risks
 * landing on another note's onset.
 */
const ONSET_ROWS = [0, 12, 19];
/** Span over which an onset rise is measured, as a fraction of the window */
const RISE_FRACTION = 0.25;
/** Minimum rise for an onset to count, as a fraction of the note's peak */
const MIN_ONSET_RISE = 0.15;

/**
 * Maps a note's peak level (dB below the loudest point) to a velocity.
 * Recordings don't say how hard notes were played, so this is a guess
 * that keeps louder notes louder.
 */
function velocityForDb(db: number) {
  return clampVelocity(Math.max(20, 127 + 1.6 * db));
}

export interface SuggestOptions {
  /** 0 (only the loudest notes) to 1 (everything plausible) */
  sensitivity: number;
}

export function suggestNotes(
  spectrogram: Spectrogram,
  { sensitivity }: SuggestOptions,
): Omit<Note, "id">[] {
  const { width, data, frameDuration, sampleRate, binsPerSemitone } =
    spectrogram;
  // Pitch must be within this many dB of the loudest point overall...
  const floorDb = -35 - 30 * sensitivity;
  // ...and of the most salient pitch in its frame
  const relativeDb = 12 + 18 * sensitivity;

  // Loudest row in each semitone, in dB and linear
  const db = new Float32Array(NUM_PITCHES * width);
  const lin = new Float32Array(NUM_PITCHES * width);
  for (let i = 0; i < NUM_PITCHES; i++) {
    const firstRow = (MAX_NOTE - (MIN_NOTE + i)) * ROWS_PER_SEMITONE;
    for (let t = 0; t < width; t++) {
      let max = -Infinity;
      for (let r = 0; r < ROWS_PER_SEMITONE; r++) {
        max = Math.max(max, data[(firstRow + r) * width + t]);
      }
      db[i * width + t] = max;
      lin[i * width + t] = Math.pow(10, max / 20);
    }
  }

  // Harmonic summation: fundamentals collect energy from their overtones
  const salience = new Float32Array(NUM_PITCHES * width);
  for (let i = 0; i < NUM_PITCHES; i++) {
    for (let t = 0; t < width; t++) {
      let sum = 0;
      for (const { offset, weight } of HARMONICS) {
        const j = i + offset;
        if (j >= NUM_PITCHES) break;
        sum += weight * lin[j * width + t];
      }
      salience[i * width + t] = 20 * Math.log10(sum + 1e-12);
    }
  }

  const frameMax = new Float32Array(width).fill(-Infinity);
  for (let i = 0; i < NUM_PITCHES; i++) {
    for (let t = 0; t < width; t++) {
      frameMax[t] = Math.max(frameMax[t], salience[i * width + t]);
    }
  }

  const active = new Uint8Array(NUM_PITCHES * width);
  for (let i = 0; i < NUM_PITCHES; i++) {
    for (let t = 0; t < width; t++) {
      const k = i * width + t;
      const s = salience[k];
      if (
        db[k] < floorDb ||
        s < frameMax[t] - relativeDb ||
        // Peak in salience and in the spectrum itself
        (i > 0 && (salience[k - width] > s || db[k - width] > db[k])) ||
        (i < NUM_PITCHES - 1 &&
          (salience[k + width] > s || db[k + width] > db[k]))
      ) {
        continue;
      }
      if (
        OVERTONES.some(
          ({ offset, marginDb }) =>
            i >= offset && db[k - offset * width] > db[k] + marginDb,
        )
      ) {
        continue;
      }
      active[k] = 1;
    }
  }

  const minFrames = Math.max(2, Math.ceil(MIN_NOTE_SECONDS / frameDuration));
  /** Analysis window length of each pitch, in frames */
  const windowFramesOf = Array.from({ length: NUM_PITCHES }, (_, i) =>
    Math.max(
      1,
      Math.round(
        fftSizeForPitch(MIN_NOTE + i, sampleRate, binsPerSemitone) /
          sampleRate /
          frameDuration,
      ),
    ),
  );

  /**
   * Times the onset of a note at pitch index `i` detected from frame
   * `detected`, as the steepest rise in level near it. A window ramps a
   * note's level up over its whole length, steepest at the actual onset.
   * Uses whichever of the note's onset rows has energy and the shortest
   * window. Returns null if there's no clear rise.
   */
  const refineOnset = (i: number, detected: number, noteEnd: number) => {
    const ownWindow = windowFramesOf[i];
    let best: { j: number; window: number; peak: number } | null = null;
    for (const offset of ONSET_ROWS) {
      const j = i + offset;
      if (j >= NUM_PITCHES) break;
      let peak = -Infinity;
      for (let t = detected; t < noteEnd; t++) {
        peak = Math.max(peak, db[j * width + t]);
      }
      if (peak < floorDb) continue;
      if (best == null || windowFramesOf[j] < best.window) {
        best = { j, window: windowFramesOf[j], peak: Math.pow(10, peak / 20) };
      }
    }
    if (best == null) return null;

    // The detected start lies within half a window of the onset, either way
    const span = Math.max(1, Math.round(RISE_FRACTION * best.window));
    const from = Math.max(span, detected - Math.ceil(ownWindow / 2));
    const to = Math.min(noteEnd, detected + Math.ceil(ownWindow * 0.75));
    // Linear level: in dB, a ramp out of silence is steepest at its very
    // start rather than its middle
    const row = best.j * width;
    let steepest = MIN_ONSET_RISE * best.peak;
    let onset: number | null = null;
    for (let t = from; t < to; t++) {
      const rise = lin[row + t] - lin[row + t - span];
      if (rise > steepest) {
        steepest = rise;
        onset = t - span / 2;
      }
    }
    return onset;
  };

  /** dB rise of pitch index i at frame t over the previous few frames */
  const rise = (i: number, t: number) => {
    let before = Infinity;
    for (let b = 1; b <= ONSET_LOOKBACK && t - b >= 0; b++) {
      before = Math.min(before, db[i * width + t - b]);
    }
    return Number.isFinite(before) ? db[i * width + t] - before : 0;
  };
  const neighbourRise = (i: number, t: number) =>
    Math.max(
      i >= 2 ? rise(i - 2, t) : 0,
      i < NUM_PITCHES - 2 ? rise(i + 2, t) : 0,
    );
  const notes: Omit<Note, "id">[] = [];
  for (let i = 0; i < NUM_PITCHES; i++) {
    const row = i * width;
    // Majority vote over 3 frames to fill gaps and drop blips
    const on = (t: number) =>
      active[row + Math.max(0, t - 1)] +
        active[row + t] +
        active[row + Math.min(width - 1, t + 1)] >=
      2;

    const windowSeconds =
      fftSizeForPitch(MIN_NOTE + i, sampleRate, binsPerSemitone) / sampleRate;
    const smear = WINDOW_SMEAR * windowSeconds;
    // A note's energy is smeared over at least a whole window, so shorter
    // detections are noise, and its attack ramp isn't a re-attack
    const windowFrames = Math.max(
      minFrames,
      Math.ceil(windowSeconds / frameDuration),
    );
    let start = -1;
    const end = (t: number) => {
      if (start >= 0 && t - start >= windowFrames) {
        const endSeconds = t * frameDuration - smear;
        const onset = refineOnset(i, start, t);
        const startSeconds = Math.min(
          endSeconds - MIN_NOTE_SECONDS,
          onset != null ? onset * frameDuration : start * frameDuration + smear,
        );
        let peakDb = -Infinity;
        for (let f = start; f < t; f++) peakDb = Math.max(peakDb, db[row + f]);
        notes.push({
          pitch: MIN_NOTE + i,
          start: startSeconds,
          duration: Math.max(MIN_NOTE_SECONDS, endSeconds - startSeconds),
          velocity: velocityForDb(peakDb),
        });
      }
      start = -1;
    };

    for (let t = 0; t < width; t++) {
      if (!on(t)) {
        end(t);
        continue;
      }
      if (start < 0) {
        start = t;
        continue;
      }
      // Split repeated notes on a re-attack
      if (
        t - start >= windowFrames &&
        rise(i, t) - neighbourRise(i, t) > ONSET_DB
      ) {
        end(t);
        start = t;
      }
    }
    end(width);
  }

  return notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}
