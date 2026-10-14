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
  const { width, data, frameDuration, sampleRate } = spectrogram;
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
      fftSizeForPitch(MIN_NOTE + i, sampleRate) / sampleRate;
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
        const startSeconds = start * frameDuration + smear;
        const endSeconds = t * frameDuration - smear;
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
