import {
  DownloadIcon,
  FileAudioIcon,
  PlayIcon,
  MetronomeIcon,
  Redo2Icon,
  SquareIcon,
  Trash2Icon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { analyze, toMono } from "./analyze";
import { renderSpectrogram } from "./colormap";
import { DEFAULT_GRID, snapStep, snapTime, type Grid } from "./grid";
import { GridControls } from "./GridControls";
import { useNoteHistory } from "./history";
import {
  clampVelocity,
  createNote,
  midiToNotes,
  noteName,
  notesToMidi,
  type Note,
} from "./notes";
import { PianoRoll, type HoverInfo } from "./PianoRoll";
import { levelToGain, loadMix, saveMix, type Channel, type Mix } from "./mix";
import { MixControls } from "./MixControls";
import { Player } from "./player";
import { SuggestControls } from "./SuggestControls";
import { ViewControls } from "./ViewControls";
import { suggestNotes } from "./suggest";
import {
  loadSession,
  saveSession,
  sessionKey as getSessionKey,
} from "./session";
import {
  MAX_NOTE,
  midiToFrequency,
  MIN_NOTE,
  RESOLUTIONS,
  type Resolution,
  type Spectrogram,
} from "./spectrogram";

const SEMITONE_HEIGHT = 14;

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

function sliderValue(value: number | readonly number[]) {
  return Array.isArray(value) ? value[0] : (value as number);
}

function isInteractive(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    target.closest(
      "button, input, select, textarea, [role=slider], [role=combobox], [contenteditable]",
    ) != null
  );
}

/** Velocity change for Alt+Up/Down */
const VELOCITY_STEP = 8;

const RESOLUTION_STORAGE_KEY = "miditool:transcribe:resolution";

function loadResolution(): Resolution {
  try {
    const saved = localStorage.getItem(RESOLUTION_STORAGE_KEY);
    if (saved != null && saved in RESOLUTIONS) return saved as Resolution;
  } catch {
    // Fall back to the default
  }
  return "balanced";
}

function saveResolution(resolution: Resolution) {
  try {
    localStorage.setItem(RESOLUTION_STORAGE_KEY, resolution);
  } catch {
    // Remembering the resolution is a convenience
  }
}

export function TranscribeTool() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [spectrogram, setSpectrogram] = useState<Spectrogram | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [resolution, setResolution] = useState<Resolution>(loadResolution);
  /** Decoded audio, kept to re-analyze at another resolution */
  const audioRef = useRef<{ samples: Float32Array; sampleRate: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [floorDb, setFloorDb] = useState(-70);
  const [zoom, setZoom] = useState(150);
  const [mix, setMix] = useState<Mix>(loadMix);
  const [grid, setGrid] = useState<Grid>(DEFAULT_GRID);
  const [suggesting, setSuggesting] = useState(false);
  const [sensitivity, setSensitivity] = useState(0.4);
  const deferredSensitivity = useDeferredValue(sensitivity);
  const {
    notes,
    setNotes,
    checkpoint,
    commit,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
  } = useNoteHistory();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /** Where playback starts, in seconds */
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(cursor);
  useLayoutEffect(() => {
    cursorRef.current = cursor;
  });
  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;
  const editingVelocityRef = useRef(false);
  // For keyboard shortcuts, which run outside React's event system
  const selectedIdRef = useRef(selectedId);
  const notesRef = useRef(notes);
  useLayoutEffect(() => {
    selectedIdRef.current = selectedId;
    notesRef.current = notes;
  });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  /** Short-lived status message shown in the footer */
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const midiInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const playing = useSyncExternalStore(
    player?.subscribe ?? noopSubscribe,
    () => player?.playing ?? false,
  );
  const [currentTime, setCurrentTime] = useState(0);

  // Tick the time display while playing
  useEffect(() => {
    if (player == null) return;
    let frame = 0;
    const tick = () => {
      setCurrentTime(player.currentTime);
      if (player.playing) frame = requestAnimationFrame(tick);
    };
    const unsubscribe = player.subscribe(() => {
      cancelAnimationFrame(frame);
      tick();
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [player]);

  const image = useMemo(
    () => (spectrogram ? renderSpectrogram(spectrogram, floorDb) : null),
    [spectrogram, floorDb],
  );

  const detected = useMemo(
    () =>
      suggesting && spectrogram
        ? suggestNotes(spectrogram, { sensitivity: deferredSensitivity })
        : [],
    [suggesting, spectrogram, deferredSensitivity],
  );
  // Hide suggestions already covered by a note
  const suggestions = useMemo(
    () =>
      detected.filter(
        (s) =>
          !notes.some(
            (n) =>
              n.pitch === s.pitch &&
              n.start < s.start + s.duration &&
              s.start < n.start + n.duration,
          ),
      ),
    [detected, notes],
  );

  /** Snaps a note's start and end to the grid */
  const snapNote = (note: Omit<Note, "id">): Omit<Note, "id"> => {
    const step = snapStep(grid);
    if (step == null) return note;
    const start = Math.max(0, snapTime(grid, note.start));
    const end = Math.max(
      start + step,
      snapTime(grid, note.start + note.duration),
    );
    return { ...note, start, duration: end - start };
  };

  const acceptSuggestion = (index: number) => {
    const suggestion = suggestions[index];
    if (suggestion == null) return null;
    const note = createNote(snapNote(suggestion));
    commit((notes) => [...notes, note]);
    return note.id;
  };

  const acceptAllSuggestions = () => {
    const accepted = suggestions.map((s) => createNote(snapNote(s)));
    commit((notes) => [...notes, ...accepted]);
    setSuggesting(false);
    setNotice(`Added ${accepted.length} suggested notes`);
  };

  useEffect(() => () => player?.dispose(), [player]);
  useEffect(() => player?.setNotes(notes), [player, notes]);
  useEffect(
    () =>
      player?.setMetronome(
        grid.enabled && mix.enabled.includes("metronome") ? grid : null,
      ),
    [player, grid, mix.enabled],
  );
  useEffect(() => {
    const gain = (channel: Channel) =>
      mix.enabled.includes(channel) ? levelToGain(mix.levels[channel]) : 0;
    player?.setAudioVolume(gain("audio"));
    player?.setNotesVolume(gain("notes"));
    player?.setMetronomeVolume(gain("metronome"));
    saveMix(mix);
  }, [player, mix]);

  // Autosave, debounced, flushing when the page is hidden
  useEffect(() => {
    if (sessionKey == null) return;
    const save = () => saveSession(sessionKey, { notes, grid });
    const timeout = setTimeout(save, 300);
    window.addEventListener("pagehide", save);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("pagehide", save);
    };
  }, [sessionKey, notes, grid]);

  useEffect(() => {
    if (notice == null) return;
    const timeout = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timeout);
  }, [notice]);

  // Keyboard shortcuts
  useEffect(() => {
    if (spectrogram == null || player == null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isInteractive(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const selectedId = selectedIdRef.current;
      if (e.key === " ") {
        // Like Ableton: Space plays from the cursor, Shift+Space resumes
        // from where playback stopped
        e.preventDefault();
        if (player.playing) player.pause();
        else if (e.shiftKey) player.play();
        else player.playFrom(cursorRef.current);
      } else if (e.key === "Home") {
        e.preventDefault();
        setCursor(0);
        if (player.playing) player.seek(0);
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === "Escape") {
        setSelectedId(null);
      } else if (selectedId == null) {
        return;
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        commit((notes) => notes.filter((note) => note.id !== selectedId));
        setSelectedId(null);
      } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const step = e.key === "ArrowUp" ? VELOCITY_STEP : -VELOCITY_STEP;
        commit((notes) =>
          notes.map((note) =>
            note.id === selectedId
              ? { ...note, velocity: clampVelocity(note.velocity + step) }
              : note,
          ),
        );
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const step = (e.shiftKey ? 12 : 1) * (e.key === "ArrowUp" ? 1 : -1);
        const transpose = (pitch: number) =>
          Math.min(MAX_NOTE, Math.max(MIN_NOTE, pitch + step));
        commit((notes) =>
          notes.map((note) =>
            note.id === selectedId
              ? { ...note, pitch: transpose(note.pitch) }
              : note,
          ),
        );
        const note = notesRef.current.find((note) => note.id === selectedId);
        if (note) player.preview(transpose(note.pitch));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [spectrogram, player, commit, undo, redo]);

  /** Cancels any analysis in progress and returns a signal for a new one */
  const startTask = () => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    return abort.signal;
  };

  const runAnalysis = async (resolution: Resolution, signal: AbortSignal) => {
    const audio = audioRef.current;
    if (audio == null) return;
    setProgress(0);
    try {
      const result = await analyze(
        audio.samples,
        audio.sampleRate,
        RESOLUTIONS[resolution],
        setProgress,
        signal,
      );
      setSpectrogram(result);
    } finally {
      if (!signal.aborted) setProgress(null);
    }
  };

  const changeResolution = (next: Resolution) => {
    setResolution(next);
    saveResolution(next);
    runAnalysis(next, startTask()).catch((err) => {
      if (err?.name === "AbortError") return;
      console.error(err);
      setNotice(`Couldn't re-analyze: ${String(err)}`);
    });
  };

  const loadFile = async (file: File) => {
    const signal = startTask();
    audioRef.current = null;

    const p = player ?? new Player();
    if (player == null) setPlayer(p);
    p.load(null);
    setFileName(file.name);
    setError(null);
    setSpectrogram(null);
    setSuggesting(false);
    setCursor(0);
    setSelectedId(null);
    setProgress(0);

    // Restore the last transcription of this file
    const key = getSessionKey(file);
    const saved = loadSession(key);
    reset(saved?.notes.map(createNote) ?? []);
    setGrid(saved?.grid ?? DEFAULT_GRID);
    setSessionKey(key);
    setNotice(
      saved?.notes.length
        ? `Restored ${saved.notes.length} notes from last time`
        : null,
    );

    try {
      const buffer = await p.ctx.decodeAudioData(await file.arrayBuffer());
      if (signal.aborted) return;
      p.load(buffer);
      setDuration(buffer.duration);
      audioRef.current = {
        samples: toMono(buffer),
        sampleRate: buffer.sampleRate,
      };
      await runAnalysis(resolution, signal);
    } catch (err) {
      if (signal.aborted) return;
      console.error(err);
      setError(
        err instanceof DOMException && err.name === "EncodingError"
          ? "Couldn't decode that file. Try a WAV, MP3, OGG, FLAC or M4A file."
          : `Couldn't analyze that file: ${String(err)}`,
      );
    } finally {
      if (!signal.aborted) setProgress(null);
    }
  };

  const importMidi = async (file: File) => {
    try {
      const imported = midiToNotes(new Uint8Array(await file.arrayBuffer()));
      // Tick 0 goes at bar 1 when there's a grid
      const offset = grid.enabled ? grid.offset : 0;
      commit(() =>
        imported.notes.map((note) =>
          createNote({ ...note, start: note.start + offset }),
        ),
      );
      setSelectedId(null);
      if (!grid.enabled && imported.bpm != null) {
        setGrid({
          ...grid,
          enabled: true,
          bpm: imported.bpm,
          beatsPerBar: imported.beatsPerBar ?? grid.beatsPerBar,
          offset: 0,
        });
      }
      setNotice(`Imported ${imported.notes.length} notes from ${file.name}`);
    } catch (err) {
      console.error(err);
      setNotice(`Couldn't read ${file.name} as a MIDI file`);
    }
  };

  const exportMidi = () => {
    const bytes = notesToMidi(
      [...notes].sort((a, b) => a.start - b.start),
      grid,
    );
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
      type: "audio/midi",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(fileName ?? "transcription").replace(/\.[^.]+$/, "")}.mid`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="audio/*"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void loadFile(file);
        e.target.value = "";
      }}
    />
  );

  const midiInput = (
    <input
      ref={midiInputRef}
      type="file"
      accept=".mid,.midi,audio/midi"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void importMidi(file);
        e.target.value = "";
      }}
    />
  );

  const openButton = (
    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
      <FileAudioIcon data-icon="inline-start" />
      Open audio…
    </Button>
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-3 p-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file == null) return;
        if (/\.midi?$/i.test(file.name)) {
          if (spectrogram != null) void importMidi(file);
        } else {
          void loadFile(file);
        }
      }}
    >
      {fileInput}
      {midiInput}

      {spectrogram == null || image == null || player == null ? (
        <div
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center",
            dragging && "border-primary bg-muted/50",
          )}
        >
          {progress != null ? (
            <>
              <p className="text-sm font-medium">Analyzing {fileName}…</p>
              <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <FileAudioIcon className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Transcribe audio to MIDI</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Open an audio file to see its spectrogram on a piano roll,
                  then draw notes over it and export them as MIDI.
                </p>
              </div>
              {openButton}
              <p className="text-xs text-muted-foreground">
                or drop a file anywhere here
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {openButton}
            <span
              className="max-w-48 truncate text-sm text-muted-foreground"
              title={fileName ?? undefined}
            >
              {fileName}
            </span>

            <div className="flex items-center gap-2">
              <Button
                size="icon"
                aria-label={playing ? "Stop" : "Play from cursor"}
                onClick={() =>
                  playing ? player.pause() : player.playFrom(cursor)
                }
              >
                {playing ? <SquareIcon /> : <PlayIcon />}
              </Button>
              <Toggle
                variant="outline"
                aria-label="Metronome"
                title={
                  grid.enabled
                    ? "Metronome"
                    : "Metronome: set a tempo in Grid first"
                }
                disabled={!grid.enabled}
                className="data-pressed:bg-primary data-pressed:text-primary-foreground data-pressed:hover:bg-primary/85 data-pressed:hover:text-primary-foreground"
                pressed={grid.enabled && mix.enabled.includes("metronome")}
                onPressedChange={(on) =>
                  setMix({
                    ...mix,
                    enabled: on
                      ? [...mix.enabled, "metronome"]
                      : mix.enabled.filter((c) => c !== "metronome"),
                  })
                }
              >
                <MetronomeIcon />
              </Toggle>
              <span className="text-sm tabular-nums">
                {formatTime(playing ? currentTime : cursor)}
                <span className="text-muted-foreground">
                  {" "}
                  / {formatTime(duration)}
                </span>
              </span>
            </div>

            <MixControls mix={mix} onChange={setMix} />

            <GridControls
              grid={grid}
              onChange={setGrid}
              cursor={playing ? currentTime : cursor}
            />
            <SuggestControls
              active={suggesting}
              onActiveChange={setSuggesting}
              sensitivity={sensitivity}
              onSensitivityChange={setSensitivity}
              count={suggestions.length}
              onAcceptAll={acceptAllSuggestions}
            />

            {selectedNote && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Velocity
                <Slider
                  className="data-horizontal:w-24"
                  min={1}
                  max={127}
                  step={1}
                  value={[selectedNote.velocity]}
                  onValueChange={(value) => {
                    // One undo step per drag
                    if (!editingVelocityRef.current) {
                      checkpoint();
                      editingVelocityRef.current = true;
                    }
                    const velocity = sliderValue(value);
                    setNotes((notes) =>
                      notes.map((note) =>
                        note.id === selectedNote.id
                          ? { ...note, velocity }
                          : note,
                      ),
                    );
                  }}
                  onValueCommitted={() => {
                    editingVelocityRef.current = false;
                  }}
                />
                <span className="w-7 text-foreground tabular-nums">
                  {selectedNote.velocity}
                </span>
              </label>
            )}

            <ViewControls
              resolution={resolution}
              onResolutionChange={changeResolution}
              analyzing={progress != null}
              zoom={zoom}
              onZoomChange={setZoom}
              floorDb={floorDb}
              onFloorDbChange={setFloorDb}
            />

            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Undo"
                disabled={!canUndo}
                onClick={undo}
              >
                <Undo2Icon />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Redo"
                disabled={!canRedo}
                onClick={redo}
              >
                <Redo2Icon />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Clear notes"
                disabled={notes.length === 0}
                onClick={() => {
                  commit(() => []);
                  setSelectedId(null);
                }}
              >
                <Trash2Icon />
              </Button>
              <Button
                variant="outline"
                onClick={() => midiInputRef.current?.click()}
              >
                <UploadIcon data-icon="inline-start" />
                Import MIDI
              </Button>
              <Button disabled={notes.length === 0} onClick={exportMidi}>
                <DownloadIcon data-icon="inline-start" />
                Export MIDI
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <PianoRoll
              spectrogram={spectrogram}
              image={image}
              duration={duration}
              player={player}
              notes={notes}
              setNotes={setNotes}
              checkpoint={checkpoint}
              selectedId={selectedId}
              onSelect={setSelectedId}
              zoom={zoom}
              onZoom={setZoom}
              semitoneHeight={SEMITONE_HEIGHT}
              grid={grid}
              cursor={cursor}
              onCursorChange={setCursor}
              onHover={setHover}
              suggestions={suggestions}
              onAcceptSuggestion={acceptSuggestion}
            />
          </div>

          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {hover
                ? `${noteName(hover.pitch)} · ${midiToFrequency(hover.pitch).toFixed(1)} Hz` +
                  (Number.isNaN(hover.time)
                    ? ""
                    : ` · ${formatTime(hover.time)}`)
                : progress != null
                  ? `Re-analyzing… ${Math.round(progress * 100)}%`
                  : (notice ??
                    `${notes.length} note${notes.length === 1 ? "" : "s"} · saved in this browser`)}
            </span>
            <span>
              Drag to draw · drag a note to move, its edge to resize · ↑↓
              transpose · Alt+↑↓ velocity · Alt-click to delete · click the
              ruler to set the cursor · Space plays from it, Shift+Space resumes
              · ⌘/Ctrl+scroll to zoom
            </span>
          </div>
        </>
      )}
    </div>
  );
}

const noopSubscribe = () => () => {};
