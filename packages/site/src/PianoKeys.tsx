import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

interface PianoKeysProps {
  lowestNote: number;
  highestNote: number;
  highlightedKeys?: number[];
  onKeyDown?: (note: number) => void;
  onKeyUp?: (note: number) => void;
}

const WHITE_KEY_WIDTH = 40;
const BLACK_KEY_WIDTH = 24;
const BLACK_KEY_HEIGHT = 70;
const WHITE_KEY_HEIGHT = 120;

const isBlackKey = (midiNote: number): boolean => {
  const scaleDegree = midiNote % 12;
  return [1, 3, 6, 8, 10].includes(scaleDegree);
};

// Label C keys with their octave, ie. 60 -> "C4"
const noteLabel = (midiNote: number) =>
  midiNote % 12 === 0 ? `C${midiNote / 12 - 1}` : null;

const PianoKeys: React.FC<PianoKeysProps> = ({
  lowestNote,
  highestNote,
  highlightedKeys = [],
  onKeyDown,
  onKeyUp,
}) => {
  const [activeKeys, setActiveKeys] = useState<number[]>([]);

  const allNotes = useMemo(
    () =>
      Array.from(
        { length: highestNote - lowestNote + 1 },
        (_, i) => lowestNote + i
      ),
    [lowestNote, highestNote]
  );

  const handleMouseDown = (note: number) => {
    setActiveKeys((prev) => [...prev, note]);
    onKeyDown?.(note);
  };

  const handleMouseUp = (note: number) => {
    setActiveKeys((prev) => prev.filter((n) => n !== note));
    onKeyUp?.(note);
  };

  const isActive = (note: number) => activeKeys.includes(note);
  const isHighlighted = (note: number) => highlightedKeys.includes(note);

  // Separate white and black keys for layering
  const whiteKeys = allNotes.filter((n) => !isBlackKey(n));
  const blackKeys = allNotes.filter((n) => isBlackKey(n));

  return (
    <div className="relative inline-block touch-none select-none">
      {/* White keys */}
      <div className="flex">
        {whiteKeys.map((note) => {
          const active = isActive(note);
          const highlighted = isHighlighted(note);
          return (
            <div
              key={note}
              onPointerDown={() => handleMouseDown(note)}
              onPointerUp={() => handleMouseUp(note)}
              onPointerLeave={() => active && handleMouseUp(note)}
              className={cn(
                "flex items-end justify-center rounded-b-md border border-r-0 border-neutral-300 bg-white pb-1 text-[10px] text-neutral-400 last:border-r",
                highlighted && "bg-amber-200",
                active && "bg-sky-300"
              )}
              style={{ width: WHITE_KEY_WIDTH, height: WHITE_KEY_HEIGHT }}
            >
              {noteLabel(note)}
            </div>
          );
        })}
      </div>

      {/* Black keys (absolutely positioned on top) */}
      <div className="absolute top-0 left-0 flex pointer-events-none">
        {allNotes.map((note, i) => {
          if (!isBlackKey(note)) return null;

          const previousWhites = allNotes
            .slice(0, i)
            .filter((n) => !isBlackKey(n)).length;

          const left = previousWhites * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2;

          const active = isActive(note);
          const highlighted = isHighlighted(note);

          return (
            <div
              key={note}
              className={cn(
                "pointer-events-auto absolute rounded-b bg-neutral-900",
                highlighted && "bg-amber-500",
                active && "bg-sky-500"
              )}
              onPointerDown={() => handleMouseDown(note)}
              onPointerUp={() => handleMouseUp(note)}
              onPointerLeave={() => active && handleMouseUp(note)}
              style={{
                left,
                width: BLACK_KEY_WIDTH,
                height: BLACK_KEY_HEIGHT,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default PianoKeys;
