import {
  DownloadIcon,
  FileAudioIcon,
  PauseIcon,
  PlayIcon,
  Redo2Icon,
  Trash2Icon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { analyze, toMono } from "./analyze";
import { renderSpectrogram } from "./colormap";
import { DEFAULT_GRID, type Grid } from "./grid";
import { GridControls } from "./GridControls";
import { useNoteHistory } from "./history";
import { createNote, midiToNotes, noteName, notesToMidi } from "./notes";
import { PianoRoll, type HoverInfo } from "./PianoRoll";
import { Player } from "./player";
import {
  loadSession,
  saveSession,
  sessionKey as getSessionKey,
} from "./session";
import {
  MAX_NOTE,
  midiToFrequency,
  MIN_NOTE,
  type Spectrogram,
} from "./spectrogram";

const SEMITONE_HEIGHT = 14;

// Zoom slider is exponential: 0 -> 10px/s, 100 -> 1000px/s
const sliderToZoom = (v: number) => 10 * Math.pow(100, v / 100);
const zoomToSlider = (zoom: number) => 50 * Math.log10(zoom / 10);

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

export function TranscribeTool() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [spectrogram, setSpectrogram] = useState<Spectrogram | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [floorDb, setFloorDb] = useState(-70);
  const [zoom, setZoom] = useState(150);
  const [mix, setMix] = useState<string[]>(["audio", "notes"]);
  const [grid, setGrid] = useState<Grid>(DEFAULT_GRID);
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

  useEffect(() => () => player?.dispose(), [player]);
  useEffect(() => player?.setNotes(notes), [player, notes]);
  useEffect(() => {
    player?.setAudioVolume(mix.includes("audio") ? 1 : 0);
    player?.setNotesVolume(mix.includes("notes") ? 1 : 0);
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
        e.preventDefault();
        player.toggle();
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

  const loadFile = async (file: File) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const p = player ?? new Player();
    if (player == null) setPlayer(p);
    p.load(null);
    setFileName(file.name);
    setError(null);
    setSpectrogram(null);
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
      if (abort.signal.aborted) return;
      p.load(buffer);
      setDuration(buffer.duration);
      const result = await analyze(
        toMono(buffer),
        buffer.sampleRate,
        setProgress,
        abort.signal,
      );
      setSpectrogram(result);
    } catch (err) {
      if (abort.signal.aborted) return;
      console.error(err);
      setError(
        err instanceof DOMException && err.name === "EncodingError"
          ? "Couldn't decode that file. Try a WAV, MP3, OGG, FLAC or M4A file."
          : `Couldn't analyze that file: ${String(err)}`,
      );
    } finally {
      if (!abort.signal.aborted) setProgress(null);
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
                aria-label={playing ? "Pause" : "Play"}
                onClick={() => player.toggle()}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </Button>
              <span className="text-sm tabular-nums">
                {formatTime(currentTime)}
                <span className="text-muted-foreground">
                  {" "}
                  / {formatTime(duration)}
                </span>
              </span>
            </div>

            <ToggleGroup
              multiple
              variant="outline"
              size="sm"
              spacing={0}
              value={mix}
              onValueChange={setMix}
              aria-label="Playback"
            >
              <ToggleGroupItem value="audio">Audio</ToggleGroupItem>
              <ToggleGroupItem value="notes">Notes</ToggleGroupItem>
            </ToggleGroup>

            <GridControls
              grid={grid}
              onChange={setGrid}
              currentTime={currentTime}
            />

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Zoom
              <Slider
                className="data-horizontal:w-28"
                min={0}
                max={100}
                step={0.5}
                value={[zoomToSlider(zoom)]}
                onValueChange={(v) => setZoom(sliderToZoom(sliderValue(v)))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Range
              <Slider
                className="data-horizontal:w-28"
                min={20}
                max={100}
                value={[-floorDb]}
                onValueChange={(v) => setFloorDb(-sliderValue(v))}
              />
            </label>

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
              onHover={setHover}
            />
          </div>

          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {hover
                ? `${noteName(hover.pitch)} · ${midiToFrequency(hover.pitch).toFixed(1)} Hz` +
                  (Number.isNaN(hover.time)
                    ? ""
                    : ` · ${formatTime(hover.time)}`)
                : (notice ??
                  `${notes.length} note${notes.length === 1 ? "" : "s"} · saved in this browser`)}
            </span>
            <span>
              Drag to draw · drag a note to move, its edge to resize · ↑↓ to
              transpose · Alt-click to delete · Space to play · ⌘/Ctrl+scroll to
              zoom
            </span>
          </div>
        </>
      )}
    </div>
  );
}

const noopSubscribe = () => () => {};
