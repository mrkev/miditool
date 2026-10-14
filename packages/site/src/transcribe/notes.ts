import { parseMidi, writeMidi, type MidiEvent } from "midi-file";
import type { Grid } from "./grid";

export interface Note {
  id: number;
  /** MIDI note number */
  pitch: number;
  /** Seconds */
  start: number;
  /** Seconds */
  duration: number;
}

let nextId = 1;
export function createNote(fields: Omit<Note, "id">): Note {
  return { id: nextId++, ...fields };
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export function noteName(pitch: number) {
  return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function isBlackKey(pitch: number) {
  return [1, 3, 6, 8, 10].includes(pitch % 12);
}

const TICKS_PER_BEAT = 480;
const DEFAULT_BPM = 120;

/**
 * Encodes notes as a single-track MIDI file. With an enabled grid, uses its
 * tempo and time signature, and lines bar 1 up with a bar line (notes before
 * it go in pickup bars). Otherwise uses 120 BPM from time 0.
 */
export function notesToMidi(notes: Note[], grid?: Grid): Uint8Array {
  const tempo = grid?.enabled ? grid : null;
  const bpm = tempo?.bpm ?? DEFAULT_BPM;
  const beatsPerBar = tempo?.beatsPerBar ?? 4;
  const offset = tempo?.offset ?? 0;
  const beat = 60 / bpm;
  // Whole bars to fit any notes that start before bar 1
  const earliest = Math.min(offset, ...notes.map((note) => note.start));
  const pickupBeats =
    Math.ceil((offset - earliest) / beat / beatsPerBar) * beatsPerBar;
  const toTick = (time: number) =>
    Math.max(
      0,
      Math.round(((time - offset) / beat + pickupBeats) * TICKS_PER_BEAT),
    );

  const events = notes
    .flatMap((note) => [
      { tick: toTick(note.start), on: true, note },
      { tick: toTick(note.start + note.duration), on: false, note },
    ])
    // Note-offs first, so back-to-back notes of the same pitch don't cut
    // each other off
    .sort((a, b) => a.tick - b.tick || Number(a.on) - Number(b.on));

  const track: MidiEvent[] = [
    {
      deltaTime: 0,
      meta: true,
      type: "setTempo",
      microsecondsPerBeat: Math.round(60_000_000 / bpm),
    },
    {
      deltaTime: 0,
      meta: true,
      type: "timeSignature",
      numerator: beatsPerBar,
      denominator: 4,
      metronome: 24,
      thirtyseconds: 8,
    },
  ];
  let lastTick = 0;
  for (const { tick, on, note } of events) {
    track.push({
      deltaTime: tick - lastTick,
      channel: 0,
      type: on ? "noteOn" : "noteOff",
      noteNumber: note.pitch,
      velocity: on ? 100 : 0,
    });
    lastTick = tick;
  }
  track.push({ deltaTime: 0, meta: true, type: "endOfTrack" });

  return new Uint8Array(
    writeMidi({
      header: { format: 0, numTracks: 1, ticksPerBeat: TICKS_PER_BEAT },
      tracks: [track],
    }),
  );
}

export interface ImportedMidi {
  notes: Omit<Note, "id">[];
  /** Initial tempo, if the file sets one */
  bpm: number | null;
  /** Initial time signature numerator, if the file sets one */
  beatsPerBar: number | null;
}

/** Reads the notes from all tracks of a MIDI file, timed in seconds */
export function midiToNotes(bytes: Uint8Array): ImportedMidi {
  const { header, tracks } = parseMidi(bytes);

  // Absolute ticks for every event
  const timed = tracks.flatMap((track) => {
    let tick = 0;
    return track.map((event) => {
      tick += event.deltaTime;
      return { tick, event };
    });
  });

  let toSeconds: (tick: number) => number;
  let bpm: number | null = null;
  if (header.ticksPerBeat != null) {
    // Integrate the tempo map
    const tempos = timed
      .flatMap(({ tick, event }) =>
        event.type === "setTempo"
          ? [
              {
                tick,
                secondsPerTick:
                  event.microsecondsPerBeat / 1e6 / header.ticksPerBeat!,
              },
            ]
          : [],
      )
      .sort((a, b) => a.tick - b.tick);
    if (tempos.length > 0) {
      bpm =
        Math.round(
          (60 / (tempos[0].secondsPerTick * header.ticksPerBeat)) * 100,
        ) / 100;
    }
    const segments: {
      tick: number;
      seconds: number;
      secondsPerTick: number;
    }[] = [{ tick: 0, seconds: 0, secondsPerTick: 0.5 / header.ticksPerBeat }];
    for (const { tick, secondsPerTick } of tempos) {
      const last = segments[segments.length - 1];
      segments.push({
        tick,
        seconds: last.seconds + (tick - last.tick) * last.secondsPerTick,
        secondsPerTick,
      });
    }
    toSeconds = (tick) => {
      let segment = segments[0];
      for (const s of segments) {
        if (s.tick > tick) break;
        segment = s;
      }
      return segment.seconds + (tick - segment.tick) * segment.secondsPerTick;
    };
  } else {
    // SMPTE timing
    const ticksPerSecond =
      (header.framesPerSecond ?? 30) * (header.ticksPerFrame ?? 80);
    toSeconds = (tick) => tick / ticksPerSecond;
  }

  const timeSignature = timed.find(
    ({ event }) => event.type === "timeSignature",
  );
  const beatsPerBar =
    timeSignature?.event.type === "timeSignature"
      ? timeSignature.event.numerator
      : null;

  // Pair note-ons with note-offs, per channel and pitch
  const open = new Map<string, number[]>();
  const notes: Omit<Note, "id">[] = [];
  for (const { tick, event } of timed.sort((a, b) => a.tick - b.tick)) {
    if (event.type !== "noteOn" && event.type !== "noteOff") continue;
    const key = `${event.channel}:${event.noteNumber}`;
    if (event.type === "noteOn" && event.velocity > 0) {
      open.set(key, [...(open.get(key) ?? []), tick]);
    } else {
      const starts = open.get(key);
      const start = starts?.shift();
      if (start == null) continue;
      const startSeconds = toSeconds(start);
      notes.push({
        pitch: event.noteNumber,
        start: startSeconds,
        duration: Math.max(0.02, toSeconds(tick) - startSeconds),
      });
    }
  }

  return { notes, bpm, beatsPerBar };
}
