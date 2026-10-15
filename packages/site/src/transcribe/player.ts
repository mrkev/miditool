import { beatToTime, timeToBeat, type Grid } from "./grid";
import { DEFAULT_VELOCITY, type Note } from "./notes";
import { midiToFrequency } from "./spectrogram";

/** Metronome click level at full volume */
const METRONOME_GAIN = 0.5;

/** Slow playback re-syncs notes to the media element past this, seconds */
const MAX_DRIFT = 0.015;

/** Synth level at full volume, roughly matching typical recordings */
const NOTES_GAIN = 0.3;

export interface LoadedAudio {
  buffer: AudioBuffer;
  /** The original file, streamed through a media element for slow playback */
  file: File;
}

/**
 * Plays the loaded audio, along with a simple synth voice for each note so
 * the transcription can be compared against the recording.
 *
 * At normal speed the audio plays from a buffer, sample-accurately. Slower
 * speeds play the file through a media element instead, whose built-in
 * time-stretching keeps the pitch. Song time maps to context time as
 * `startedAt + time / rate` either way, so notes and clicks follow along.
 */
export class Player {
  readonly ctx = new AudioContext();
  private readonly audioGain = this.ctx.createGain();
  private readonly notesGain = this.ctx.createGain();
  private readonly metronomeGain = this.ctx.createGain();
  /** Tempo the metronome clicks to, or null for no metronome */
  private metronome: Grid | null = null;
  private audio: LoadedAudio | null = null;
  private source: AudioBufferSourceNode | null = null;
  private element: HTMLAudioElement | null = null;
  private elementSource: MediaElementAudioSourceNode | null = null;
  private elementUrl: string | null = null;
  /** Playback speed; 1 is normal */
  private rate = 1;
  private voices: OscillatorNode[] = [];
  private notes: Note[] = [];
  /**
   * ctx.currentTime when playback position 0 would have started, at the
   * current rate
   */
  private startedAt = 0;
  /** Position when paused */
  private position = 0;
  private listeners = new Set<() => void>();

  playing = false;

  constructor() {
    this.audioGain.connect(this.ctx.destination);
    this.notesGain.connect(this.ctx.destination);
    this.metronomeGain.connect(this.ctx.destination);
    this.metronomeGain.gain.value = 0;
    this.notesGain.gain.value = NOTES_GAIN;
  }

  get duration() {
    return this.audio?.buffer.duration ?? 0;
  }

  get currentTime() {
    if (!this.playing) {
      return this.position;
    }
    return Math.min(
      (this.ctx.currentTime - this.startedAt) * this.rate,
      this.duration,
    );
  }

  get playbackRate() {
    return this.rate;
  }

  /** Context time at which song time `time` plays */
  private toContextTime(time: number) {
    return this.startedAt + time / this.rate;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  load(audio: LoadedAudio | null) {
    this.pause();
    this.releaseElement();
    this.audio = audio;
    this.position = 0;
    this.emit();
  }

  /** Sets the playback speed, keeping the pitch. Restarts if playing */
  setRate(rate: number) {
    if (rate === this.rate) return;
    const wasPlaying = this.playing;
    this.pause();
    this.rate = rate;
    if (wasPlaying) this.play();
    else this.emit();
  }

  /** The media element for slow playback, created on first use */
  private mediaElement() {
    if (this.element == null && this.audio != null) {
      this.elementUrl = URL.createObjectURL(this.audio.file);
      const element = new Audio(this.elementUrl);
      element.preservesPitch = true;
      element.onended = () => {
        if (this.playing && this.element === element) {
          this.playing = false;
          this.position = this.duration;
          this.stopVoices();
          this.emit();
        }
      };
      // Keep notes and clicks lined up with the element's own clock
      element.ontimeupdate = () => {
        if (!this.playing || this.element !== element || element.paused) {
          return;
        }
        const drift = this.currentTime - element.currentTime;
        if (Math.abs(drift) > MAX_DRIFT) {
          this.startedAt += drift / this.rate;
          this.reschedule();
        }
      };
      this.elementSource = this.ctx.createMediaElementSource(element);
      this.elementSource.connect(this.audioGain);
      this.element = element;
    }
    return this.element;
  }

  private releaseElement() {
    this.element?.pause();
    this.elementSource?.disconnect();
    if (this.elementUrl) URL.revokeObjectURL(this.elementUrl);
    this.element = null;
    this.elementSource = null;
    this.elementUrl = null;
  }

  setAudioVolume(volume: number) {
    this.audioGain.gain.value = volume;
  }

  setNotesVolume(volume: number) {
    this.notesGain.gain.value = volume * NOTES_GAIN;
  }

  setMetronomeVolume(volume: number) {
    this.metronomeGain.gain.value = volume * METRONOME_GAIN;
  }

  setNotes(notes: Note[]) {
    this.notes = notes;
    this.reschedule();
  }

  /** Clicks on every beat of `grid` while playing, or stops with null */
  setMetronome(grid: Grid | null) {
    this.metronome = grid;
    this.reschedule();
  }

  private reschedule() {
    if (this.playing) {
      this.stopVoices();
      this.scheduleVoices();
    }
  }

  play() {
    if (this.audio == null || this.playing) {
      return;
    }
    void this.ctx.resume();
    const from = this.position >= this.duration ? 0 : this.position;
    this.startedAt = this.ctx.currentTime - from / this.rate;
    this.playing = true;

    if (this.rate !== 1) {
      const element = this.mediaElement()!;
      element.playbackRate = this.rate;
      element.currentTime = from;
      element.play().then(
        () => {
          if (!this.playing || this.element !== element) return;
          // Line notes and clicks up with where the element actually is
          this.startedAt =
            this.ctx.currentTime - element.currentTime / this.rate;
          this.reschedule();
        },
        (err) => {
          console.error("Couldn't play audio", err);
          this.pause();
        },
      );
      this.scheduleVoices();
      this.emit();
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this.audio.buffer;
    source.connect(this.audioGain);
    source.onended = () => {
      // Only handle reaching the end, not stop() from pause/seek
      if (this.source === source) {
        this.source = null;
        this.playing = false;
        this.position = this.duration;
        this.stopVoices();
        this.emit();
      }
    };
    source.start(0, from);
    this.source = source;
    this.scheduleVoices();
    this.emit();
  }

  pause() {
    if (!this.playing) {
      return;
    }
    this.position = this.currentTime;
    this.playing = false;
    const source = this.source;
    this.source = null;
    source?.stop();
    this.element?.pause();
    this.stopVoices();
    this.emit();
  }

  /** Starts playing from `time`, whether or not already playing */
  playFrom(time: number) {
    this.pause();
    this.position = Math.max(0, Math.min(time, this.duration));
    this.play();
  }

  seek(time: number) {
    const wasPlaying = this.playing;
    this.pause();
    this.position = Math.max(0, Math.min(time, this.duration));
    if (wasPlaying) {
      this.play();
    } else {
      this.emit();
    }
  }

  /** Plays a short preview of a pitch */
  preview(pitch: number, duration = 0.3, velocity = DEFAULT_VELOCITY) {
    void this.ctx.resume();
    const now = this.ctx.currentTime;
    this.voice(pitch, velocity, now, now + duration);
  }

  private voice(pitch: number, velocity: number, start: number, end: number) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    // Roughly how velocity maps to loudness on most instruments
    const peak = Math.pow(velocity / 127, 1.5);
    osc.type = "triangle";
    osc.frequency.value = midiToFrequency(pitch);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(peak, start + 0.005);
    env.gain.setValueAtTime(peak, Math.max(start + 0.005, end - 0.03));
    env.gain.linearRampToValueAtTime(0, end);
    osc.connect(env).connect(this.notesGain);
    osc.start(start);
    osc.stop(end);
    return osc;
  }

  private scheduleVoices() {
    const now = this.currentTime;
    for (const note of this.notes) {
      const end = note.start + note.duration;
      if (note.muted || end <= now) {
        continue;
      }
      const start = Math.max(note.start, now);
      const osc = this.voice(
        note.pitch,
        note.velocity,
        this.toContextTime(start),
        this.toContextTime(end),
      );
      this.voices.push(osc);
    }

    // Metronome clicks, accenting the first beat of each bar
    const grid = this.metronome;
    if (grid != null) {
      const first = Math.ceil(timeToBeat(grid, now));
      const last = Math.floor(timeToBeat(grid, this.duration));
      for (let beat = first; beat <= last; beat++) {
        const time = beatToTime(grid, beat);
        if (time < 0) continue;
        const downbeat =
          ((beat % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar ===
          0;
        this.voices.push(this.click(this.toContextTime(time), downbeat));
      }
    }
  }

  private click(time: number, accent: boolean) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = accent ? 1600 : 1000;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(accent ? 1 : 0.6, time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(env).connect(this.metronomeGain);
    osc.start(time);
    osc.stop(time + 0.06);
    return osc;
  }

  private stopVoices() {
    for (const osc of this.voices) {
      osc.onended = null;
      try {
        osc.stop();
      } catch {
        // Not started yet
      }
      osc.disconnect();
    }
    this.voices = [];
  }

  dispose() {
    this.pause();
    this.releaseElement();
    void this.ctx.close();
  }
}
