import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  beatDuration,
  beatToTime,
  divisionBeats,
  snapStep,
  snapTime,
  timeToBeat,
  type Grid,
} from "./grid";
import { createNote, isBlackKey, noteName, type Note } from "./notes";
import type { Player } from "./player";
import {
  MAX_NOTE,
  MIN_NOTE,
  ROWS_PER_SEMITONE,
  type Spectrogram,
} from "./spectrogram";

const KEYS_WIDTH = 44;
const RULER_HEIGHT = 22;
/** Pointer distance from a note's right edge that resizes it */
const EDGE_PX = 6;
const MIN_DURATION = 0.02;
/** Pitch shown at the top of the view initially */
const INITIAL_TOP_PITCH = 84;

export interface HoverInfo {
  pitch: number;
  time: number;
}

type Drag =
  /** Dragging along the ruler */
  | { type: "cursor" }
  | {
      type: "move";
      id: number;
      grabOffset: number;
      pitch: number;
      checkpointed: boolean;
    }
  | {
      type: "resize";
      id: number;
      /** Note start, in seconds */
      start: number;
      /** Latest duration set by this drag */
      duration: number | null;
      created: boolean;
      startX: number;
      checkpointed: boolean;
    };

export interface PianoRollProps {
  spectrogram: Spectrogram;
  image: HTMLCanvasElement;
  duration: number;
  player: Player;
  notes: Note[];
  /** Update the notes. Call `checkpoint` first to make the change undoable */
  setNotes: (update: (notes: Note[]) => Note[]) => void;
  /** Save the current notes to the undo history */
  checkpoint: () => void;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** Pixels per second */
  zoom: number;
  onZoom: (zoom: number) => void;
  /** Pixels per semitone */
  semitoneHeight: number;
  grid: Grid;
  /** Seconds where playback starts */
  cursor: number;
  onCursorChange: (cursor: number) => void;
  onHover: (info: HoverInfo | null) => void;
  /** Detected notes shown as ghosts until accepted */
  suggestions: Omit<Note, "id">[];
  /** Accepts a suggestion, returning the id of the note it became */
  onAcceptSuggestion: (index: number) => number | null;
}

function formatRulerTime(seconds: number, step: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  const decimals = step < 1 ? (step < 0.5 ? 2 : 1) : 0;
  return `${m}:${s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, "0")}`;
}

const TIME_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];

export function PianoRoll(props: PianoRollProps) {
  const { duration, zoom, semitoneHeight, player } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const propsRef = useRef(props);
  const sizeRef = useRef(size);
  const dragRef = useRef<Drag | null>(null);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  /** Time to keep under the pointer when zoom changes */
  const zoomAnchorRef = useRef<{ time: number; x: number } | null>(null);
  /** Length of the last drawn note, used for click-to-add */
  const lastDurationRef = useRef(0.25);
  const frameRef = useRef(0);

  useLayoutEffect(() => {
    propsRef.current = props;
    sizeRef.current = size;
  });

  const contentWidth = KEYS_WIDTH + duration * zoom;
  const contentHeight =
    RULER_HEIGHT + (MAX_NOTE - MIN_NOTE + 1) * semitoneHeight;

  // Geometry, relative to the canvas
  const geometry = useCallback(() => {
    const scroll = scrollRef.current!;
    const { zoom, semitoneHeight } = propsRef.current;
    const sl = scroll.scrollLeft;
    const st = scroll.scrollTop;
    return {
      timeToX: (t: number) => KEYS_WIDTH + t * zoom - sl,
      xToTime: (x: number) => (x - KEYS_WIDTH + sl) / zoom,
      pitchToY: (p: number) =>
        RULER_HEIGHT + (MAX_NOTE - p) * semitoneHeight - st,
      yToPitch: (y: number) =>
        Math.min(
          MAX_NOTE,
          Math.max(
            MIN_NOTE,
            MAX_NOTE - Math.floor((y - RULER_HEIGHT + st) / semitoneHeight),
          ),
        ),
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const scroll = scrollRef.current;
    if (canvas == null || scroll == null) {
      return;
    }
    const { width, height } = sizeRef.current;
    const {
      image,
      spectrogram,
      notes,
      selectedId,
      zoom,
      semitoneHeight,
      player,
      duration,
      grid,
      suggestions,
      cursor,
    } = propsRef.current;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const { timeToX, xToTime, pitchToY, yToPitch } = geometry();
    const areaWidth = width - KEYS_WIDTH;
    const areaHeight = height - RULER_HEIGHT;
    const t0 = xToTime(KEYS_WIDTH);
    const t1 = xToTime(width);
    const topPitch = yToPitch(RULER_HEIGHT);
    const bottomPitch = yToPitch(height);

    // Spectrogram. Frame i is centered on i * frameDuration
    const fd = spectrogram.frameDuration;
    const sx = t0 / fd + 0.5;
    const sw = areaWidth / zoom / fd;
    const sy = (scroll.scrollTop / semitoneHeight) * ROWS_PER_SEMITONE;
    const sh = (areaHeight / semitoneHeight) * ROWS_PER_SEMITONE;
    const visibleSw = Math.min(sw, image.width - sx);
    if (visibleSw > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        image,
        sx,
        sy,
        visibleSw,
        sh,
        KEYS_WIDTH,
        RULER_HEIGHT,
        (visibleSw / sw) * areaWidth,
        areaHeight,
      );
    }

    // Pitch rows
    for (let p = bottomPitch; p <= topPitch; p++) {
      const y = pitchToY(p);
      if (isBlackKey(p)) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
        ctx.fillRect(KEYS_WIDTH, y, areaWidth, semitoneHeight);
      }
      ctx.fillStyle =
        p % 12 === 0
          ? "rgba(255, 255, 255, 0.22)"
          : "rgba(255, 255, 255, 0.06)";
      ctx.fillRect(KEYS_WIDTH, y + semitoneHeight - 1, areaWidth, 1);
    }

    // Time grid: bars and beats when there's a tempo, otherwise seconds
    const step =
      TIME_STEPS.find((s) => s * zoom >= 70) ??
      TIME_STEPS[TIME_STEPS.length - 1];
    const beatPx = beatDuration(grid) * zoom;
    const barPx = beatPx * grid.beatsPerBar;
    // Label every nth bar so labels don't overlap
    const barLabelEvery = Math.pow(
      2,
      Math.max(0, Math.ceil(Math.log2(32 / barPx))),
    );
    if (grid.enabled) {
      // Divisions (eg. 1/16 or 1/8 triplets), where they're not on a beat
      const division = divisionBeats(grid);
      if (division * beatPx >= 8) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        const first = Math.floor(timeToBeat(grid, t0) / division);
        const last = Math.ceil(timeToBeat(grid, t1) / division);
        for (let k = first; k <= last; k++) {
          const beat = k * division;
          if (Math.abs(beat - Math.round(beat)) < 1e-6) continue;
          const x = Math.round(timeToX(beatToTime(grid, beat)));
          ctx.fillRect(x, RULER_HEIGHT, 1, areaHeight);
        }
      }
      const firstBeat = Math.floor(timeToBeat(grid, t0));
      const lastBeat = Math.ceil(timeToBeat(grid, t1));
      for (let beat = firstBeat; beat <= lastBeat; beat++) {
        const isBar = beat % grid.beatsPerBar === 0;
        if (isBar || beatPx >= 6) {
          ctx.fillStyle = isBar
            ? "rgba(255, 255, 255, 0.28)"
            : "rgba(255, 255, 255, 0.12)";
          const x = Math.round(timeToX(beatToTime(grid, beat)));
          ctx.fillRect(x, RULER_HEIGHT, 1, areaHeight);
        }
      }
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
        ctx.fillRect(Math.round(timeToX(t)), RULER_HEIGHT, 1, areaHeight);
      }
    }

    // Past the end of the audio
    const endX = timeToX(duration);
    if (endX < width) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.fillRect(endX, RULER_HEIGHT, width - endX, areaHeight);
    }

    // Hovered row
    const hover = hoverRef.current;
    const hoverPitch =
      hover && hover.y >= RULER_HEIGHT ? yToPitch(hover.y) : null;
    if (hoverPitch != null && dragRef.current == null) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
      ctx.fillRect(KEYS_WIDTH, pitchToY(hoverPitch), areaWidth, semitoneHeight);
    }

    // Suggestions
    ctx.setLineDash([3, 3]);
    for (const note of suggestions) {
      if (
        note.start > t1 ||
        note.start + note.duration < t0 ||
        note.pitch > topPitch ||
        note.pitch < bottomPitch
      ) {
        continue;
      }
      const x = timeToX(note.start);
      const y = pitchToY(note.pitch);
      const w = Math.max(2, note.duration * zoom);
      ctx.beginPath();
      ctx.roundRect(x + 0.5, y + 0.5, w - 1, semitoneHeight - 1, 3);
      ctx.fillStyle = "rgba(250, 204, 21, 0.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(253, 224, 71, 0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Notes
    ctx.font = "10px 'Geist Variable', sans-serif";
    ctx.textBaseline = "middle";
    for (const note of notes) {
      if (
        note.start > t1 ||
        note.start + note.duration < t0 ||
        note.pitch > topPitch ||
        note.pitch < bottomPitch
      ) {
        continue;
      }
      const x = timeToX(note.start);
      const y = pitchToY(note.pitch);
      const w = Math.max(2, note.duration * zoom);
      const selected = note.id === selectedId;
      ctx.beginPath();
      ctx.roundRect(x + 0.5, y + 0.5, w - 1, semitoneHeight - 1, 3);
      // Louder notes are more opaque
      ctx.fillStyle = selected
        ? "rgba(125, 211, 252, 0.9)"
        : `rgba(56, 189, 248, ${0.2 + 0.6 * (note.velocity / 127)})`;
      ctx.fill();
      ctx.strokeStyle = selected ? "#fff" : "rgba(186, 230, 253, 0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (w > 28 && semitoneHeight >= 11) {
        ctx.fillStyle = "#082f49";
        ctx.fillText(noteName(note.pitch), x + 4, y + semitoneHeight / 2);
      }
    }

    // Keys
    ctx.fillStyle = "#111";
    ctx.fillRect(0, RULER_HEIGHT, KEYS_WIDTH, areaHeight);
    for (let p = bottomPitch; p <= topPitch; p++) {
      const y = pitchToY(p);
      const black = isBlackKey(p);
      ctx.fillStyle =
        p === hoverPitch ? "#7dd3fc" : black ? "#262626" : "#e5e5e5";
      ctx.fillRect(
        0,
        y,
        black ? KEYS_WIDTH * 0.65 : KEYS_WIDTH,
        semitoneHeight - 1,
      );
      if (p % 12 === 0 && semitoneHeight >= 9) {
        ctx.fillStyle = "#525252";
        ctx.textAlign = "right";
        ctx.fillText(noteName(p), KEYS_WIDTH - 4, y + semitoneHeight / 2);
        ctx.textAlign = "left";
      }
    }

    // Ruler
    ctx.fillStyle = "#171717";
    ctx.fillRect(0, 0, width, RULER_HEIGHT);
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fillRect(0, RULER_HEIGHT - 1, width, 1);
    ctx.fillStyle = "#a3a3a3";
    if (grid.enabled) {
      const firstBar = Math.floor(timeToBeat(grid, t0) / grid.beatsPerBar);
      const lastBar = Math.ceil(timeToBeat(grid, t1) / grid.beatsPerBar);
      for (let bar = firstBar; bar <= lastBar; bar++) {
        if (bar % barLabelEvery !== 0) continue;
        const x = Math.round(timeToX(beatToTime(grid, bar * grid.beatsPerBar)));
        ctx.fillRect(x, RULER_HEIGHT - 6, 1, 5);
        ctx.fillText(String(bar + 1), x + 3, RULER_HEIGHT / 2 - 1);
      }
    } else {
      for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
        const x = Math.round(timeToX(t));
        ctx.fillRect(x, RULER_HEIGHT - 6, 1, 5);
        ctx.fillText(formatRulerTime(t, step), x + 3, RULER_HEIGHT / 2 - 1);
      }
    }

    // Cursor: where playback starts. A line with a marker on the ruler
    const cx = Math.round(timeToX(cursor));
    if (cx >= KEYS_WIDTH && cx <= width) {
      ctx.fillStyle = "rgba(250, 204, 21, 0.75)";
      ctx.fillRect(cx, RULER_HEIGHT, 1, areaHeight);
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.moveTo(cx - 5, RULER_HEIGHT - 9);
      ctx.lineTo(cx + 5, RULER_HEIGHT - 9);
      ctx.lineTo(cx, RULER_HEIGHT - 1);
      ctx.closePath();
      ctx.fill();
    }

    // Playhead, while playing
    const px = timeToX(player.currentTime);
    if (player.playing && px >= KEYS_WIDTH && px <= width) {
      ctx.fillStyle = "#f43f5e";
      ctx.fillRect(Math.round(px), 0, 1.5, height);
    }
  }, [geometry]);

  const requestDraw = useCallback(() => {
    if (frameRef.current) {
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  }, [draw]);

  // Redraw after every render
  useEffect(() => {
    requestDraw();
  });

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    },
    [],
  );

  // Size the canvas to the viewport
  useLayoutEffect(() => {
    const scroll = scrollRef.current!;
    const observer = new ResizeObserver(() => {
      const width = scroll.clientWidth;
      const height = scroll.clientHeight;
      const canvas = canvasRef.current!;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      sizeRef.current = { width, height };
      setSize({ width, height });
      draw();
    });
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [draw]);

  // Start scrolled to the middle of the keyboard
  useLayoutEffect(() => {
    const scroll = scrollRef.current!;
    scroll.scrollTop =
      (MAX_NOTE - INITIAL_TOP_PITCH) * propsRef.current.semitoneHeight;
  }, [props.spectrogram]);

  // Keep the anchored time under the pointer when zooming
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    if (anchor == null) {
      return;
    }
    zoomAnchorRef.current = null;
    scrollRef.current!.scrollLeft =
      anchor.time * zoom - (anchor.x - KEYS_WIDTH);
  }, [zoom]);

  // Ctrl/Cmd + wheel (and trackpad pinch) zooms time
  useEffect(() => {
    const scroll = scrollRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        return;
      }
      e.preventDefault();
      const { zoom, onZoom } = propsRef.current;
      const x = e.clientX - scroll.getBoundingClientRect().left;
      const time = geometry().xToTime(x);
      const next = Math.min(
        2000,
        Math.max(5, zoom * Math.exp(-e.deltaY * 0.01)),
      );
      zoomAnchorRef.current = { time, x };
      onZoom(next);
    };
    scroll.addEventListener("wheel", onWheel, { passive: false });
    return () => scroll.removeEventListener("wheel", onWheel);
  }, [geometry]);

  // Animate the playhead while playing, following it with the view
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      const scroll = scrollRef.current;
      if (scroll && player.playing) {
        const x = geometry().timeToX(player.currentTime);
        const { width } = sizeRef.current;
        if (dragRef.current == null && (x > width - 40 || x < KEYS_WIDTH)) {
          scroll.scrollLeft += x - KEYS_WIDTH - (width - KEYS_WIDTH) * 0.1;
        }
        draw();
        frame = requestAnimationFrame(loop);
      }
    };
    const onChange = () => {
      cancelAnimationFrame(frame);
      if (player.playing) {
        frame = requestAnimationFrame(loop);
      } else {
        requestDraw();
      }
    };
    onChange();
    const unsubscribe = player.subscribe(onChange);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [player, draw, requestDraw, geometry]);

  const pointerPosition = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitTest = (x: number, y: number) => {
    const { timeToX, pitchToY } = geometry();
    const { notes, semitoneHeight, zoom } = propsRef.current;
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      const nx = timeToX(note.start);
      const ny = pitchToY(note.pitch);
      const w = Math.max(2, note.duration * zoom);
      if (x >= nx && x <= nx + w && y >= ny && y < ny + semitoneHeight) {
        const edge = w > EDGE_PX * 2 && x >= nx + w - EDGE_PX;
        return { note, edge };
      }
    }
    return null;
  };

  /**
   * Moves the cursor (snapped to the grid). While playing, playback jumps
   * there too.
   */
  const placeCursor = (time: number, e: React.PointerEvent) => {
    const { player, onCursorChange, duration } = propsRef.current;
    const cursor = Math.max(0, Math.min(duration, snap(time, e)));
    onCursorChange(cursor);
    if (player.playing) player.seek(cursor);
  };

  /** Snaps to the grid, unless Shift is held */
  const snap = (time: number, e: React.PointerEvent) =>
    e.shiftKey ? time : snapTime(propsRef.current.grid, time);

  const hitSuggestion = (x: number, y: number) => {
    const { timeToX, pitchToY } = geometry();
    const { suggestions, semitoneHeight, zoom } = propsRef.current;
    return suggestions.findIndex((note) => {
      const nx = timeToX(note.start);
      const ny = pitchToY(note.pitch);
      const w = Math.max(2, note.duration * zoom);
      return x >= nx && x <= nx + w && y >= ny && y < ny + semitoneHeight;
    });
  };

  const updateNote = (id: number, update: (note: Note) => Note) => {
    const { setNotes, checkpoint } = propsRef.current;
    const drag = dragRef.current;
    if (drag && drag.type !== "cursor" && !drag.checkpointed) {
      checkpoint();
      drag.checkpointed = true;
    }
    setNotes((notes) =>
      notes.map((note) => (note.id === id ? update(note) : note)),
    );
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerPosition(e);
    const { xToTime, yToPitch } = geometry();
    const {
      player,
      onSelect,
      setNotes,
      checkpoint,
      duration,
      suggestions,
      onAcceptSuggestion,
    } = propsRef.current;
    const time = Math.max(0, Math.min(duration, xToTime(x)));

    if (y < RULER_HEIGHT) {
      if (x >= KEYS_WIDTH) {
        placeCursor(time, e);
        dragRef.current = { type: "cursor" };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }

    const pitch = yToPitch(y);
    if (x < KEYS_WIDTH) {
      player.preview(pitch);
      return;
    }

    const hit = hitTest(x, y);
    // Right click or alt-click deletes
    if (e.button === 2 || e.altKey) {
      if (hit) {
        checkpoint();
        setNotes((notes) => notes.filter((note) => note.id !== hit.note.id));
        onSelect(null);
      }
      return;
    }
    if (e.button !== 0) {
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    if (hit) {
      onSelect(hit.note.id);
      player.preview(hit.note.pitch, 0.3, hit.note.velocity);
      dragRef.current = hit.edge
        ? {
            type: "resize",
            id: hit.note.id,
            start: hit.note.start,
            duration: null,
            created: false,
            startX: x,
            checkpointed: false,
          }
        : {
            type: "move",
            id: hit.note.id,
            grabOffset: time - hit.note.start,
            pitch: hit.note.pitch,
            checkpointed: false,
          };
      return;
    }

    // Clicking a suggestion accepts it
    const suggestion = hitSuggestion(x, y);
    if (suggestion >= 0) {
      const id = onAcceptSuggestion(suggestion);
      onSelect(id);
      player.preview(suggestions[suggestion].pitch);
      return;
    }

    checkpoint();
    const note = createNote({
      pitch,
      start: Math.max(0, snap(time, e)),
      duration: MIN_DURATION,
    });
    setNotes((notes) => [...notes, note]);
    onSelect(note.id);
    player.preview(pitch);
    dragRef.current = {
      type: "resize",
      id: note.id,
      start: note.start,
      duration: null,
      created: true,
      startX: x,
      checkpointed: true,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerPosition(e);
    const { xToTime, yToPitch } = geometry();
    const { player, onHover, duration } = propsRef.current;
    const canvas = e.currentTarget;
    hoverRef.current = { x, y };
    const time = xToTime(x);
    const inArea = x >= KEYS_WIDTH && y >= RULER_HEIGHT;
    onHover(
      y >= RULER_HEIGHT
        ? { pitch: yToPitch(y), time: inArea ? time : NaN }
        : null,
    );

    const drag = dragRef.current;
    if (drag == null) {
      const hit = inArea ? hitTest(x, y) : null;
      canvas.style.cursor =
        y < RULER_HEIGHT || x < KEYS_WIDTH
          ? "pointer"
          : hit?.edge
            ? "ew-resize"
            : hit
              ? "grab"
              : inArea && hitSuggestion(x, y) >= 0
                ? "copy"
                : "crosshair";
      requestDraw();
      return;
    }

    if (drag.type === "cursor") {
      placeCursor(Math.max(0, Math.min(duration, time)), e);
    } else if (drag.type === "move") {
      canvas.style.cursor = "grabbing";
      const pitch = yToPitch(y);
      if (pitch !== drag.pitch) {
        drag.pitch = pitch;
        player.preview(pitch, 0.15);
      }
      const start = Math.max(0, snap(time - drag.grabOffset, e));
      updateNote(drag.id, (note) => ({ ...note, pitch, start }));
    } else {
      canvas.style.cursor = "ew-resize";
      const step = e.shiftKey ? null : snapStep(propsRef.current.grid);
      const duration = Math.max(
        step ?? MIN_DURATION,
        snap(time, e) - drag.start,
      );
      drag.duration = duration;
      updateNote(drag.id, (note) => ({ ...note, duration }));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.type !== "resize") {
      return;
    }
    // Read from the drag rather than props, which may lag behind pointermove
    const { x } = pointerPosition(e);
    const { setNotes } = propsRef.current;
    if (drag.created && Math.abs(x - drag.startX) < 3) {
      // Plain click: add a note with the last drawn length
      const duration = lastDurationRef.current;
      setNotes((notes) =>
        notes.map((note) =>
          note.id === drag.id ? { ...note, duration } : note,
        ),
      );
    } else if (drag.duration != null) {
      lastDurationRef.current = drag.duration;
    }
  };

  return (
    <div
      ref={scrollRef}
      className="relative h-full overflow-auto overscroll-contain rounded-lg border bg-black"
      onScroll={requestDraw}
    >
      {/* Sets the scrollable area. The canvas sticks to the viewport inside it */}
      <div style={{ width: contentWidth, height: contentHeight }}>
        <canvas
          ref={canvasRef}
          className="sticky top-0 left-0 block touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            hoverRef.current = null;
            propsRef.current.onHover(null);
            requestDraw();
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
}
