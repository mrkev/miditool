import React, { useState, useMemo } from "react";
import cn from "classnames";

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
    <div className="relative inline-block select-none">
      {/* White keys */}
      <div className="flex">
        {whiteKeys.map((note) => {
          const active = isActive(note);
          const highlighted = isHighlighted(note);
          return (
            <div
              key={note}
              onMouseDown={() => handleMouseDown(note)}
              onMouseUp={() => handleMouseUp(note)}
              onMouseLeave={() => active && handleMouseUp(note)}
              className={cn(
                `border border-gray-400 text-black`,
                highlighted ? "bg-yellow-200" : "bg-white",
                active ? "bg-blue-300" : ""
              )}
              style={{
                width: WHITE_KEY_WIDTH,
                height: WHITE_KEY_HEIGHT,
                boxSizing: "border-box",
              }}
            >
              {note}
            </div>
          );
        })}
      </div>

      {/* Black keys (absolutely positioned on top) */}
      <div className="absolute top-0 left-0 flex pointer-events-none">
        {allNotes.map((note, i) => {
          if (!isBlackKey(note)) return null;

          const previousWhites = allNotes
            .slice(lowestNote - lowestNote, i)
            .filter((n) => !isBlackKey(n)).length;

          const left = previousWhites * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2;

          const active = isActive(note);
          const highlighted = isHighlighted(note);

          return (
            <div
              key={note}
              className={cn(
                `absolute pointer-events-auto`,
                highlighted ? "bg-yellow-500" : "bg-black",
                active ? "bg-blue-500" : ""
              )}
              onMouseDown={() => handleMouseDown(note)}
              onMouseUp={() => handleMouseUp(note)}
              onMouseLeave={() => active && handleMouseUp(note)}
              style={{
                left,
                width: BLACK_KEY_WIDTH,
                height: BLACK_KEY_HEIGHT,
                borderRadius: "0 0 3px 3px",
              }}
            >
              {note}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PianoKeys;
