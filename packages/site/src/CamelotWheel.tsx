import { useRef, useState } from "react";
import type { CamelotChord } from "./CamelotChord";

export type Notation = "camelot" | "musical";

interface CamelotKey {
  camelot: CamelotChord;
  musical: string;
}

// Minor keys, inner ring
const keysA: CamelotKey[] = [
  { camelot: "1A", musical: "Abm" },
  { camelot: "2A", musical: "Ebm" },
  { camelot: "3A", musical: "Bbm" },
  { camelot: "4A", musical: "Fm" },
  { camelot: "5A", musical: "Cm" },
  { camelot: "6A", musical: "Gm" },
  { camelot: "7A", musical: "Dm" },
  { camelot: "8A", musical: "Am" },
  { camelot: "9A", musical: "Em" },
  { camelot: "10A", musical: "Bm" },
  { camelot: "11A", musical: "F#m" },
  { camelot: "12A", musical: "Dbm" },
];

// Major keys, outer ring
const keysB: CamelotKey[] = [
  { camelot: "1B", musical: "B" },
  { camelot: "2B", musical: "F#" },
  { camelot: "3B", musical: "Db" },
  { camelot: "4B", musical: "Ab" },
  { camelot: "5B", musical: "Eb" },
  { camelot: "6B", musical: "Bb" },
  { camelot: "7B", musical: "F" },
  { camelot: "8B", musical: "C" },
  { camelot: "9B", musical: "G" },
  { camelot: "10B", musical: "D" },
  { camelot: "11B", musical: "A" },
  { camelot: "12B", musical: "E" },
];

const SLICE_ANGLE = (2 * Math.PI) / 12;

const RINGS = [
  {
    keys: keysB,
    innerRadius: 80,
    outerRadius: 120,
    fontSize: 12,
    fill: "#93c5fd",
    selectedFill: "#60a5fa",
    stroke: "#1e3a8a",
  },
  {
    keys: keysA,
    innerRadius: 40,
    outerRadius: 80,
    fontSize: 11,
    fill: "#6ee7b7",
    selectedFill: "#34d399",
    stroke: "#065f46",
  },
];

function slicePath(i: number, innerRadius: number, outerRadius: number) {
  const start = i * SLICE_ANGLE - Math.PI / 2;
  const end = start + SLICE_ANGLE;
  const point = (angle: number, r: number) =>
    `${Math.cos(angle) * r} ${Math.sin(angle) * r}`;

  return `
    M ${point(start, innerRadius)}
    L ${point(start, outerRadius)}
    A ${outerRadius} ${outerRadius} 0 0 1 ${point(end, outerRadius)}
    L ${point(end, innerRadius)}
    A ${innerRadius} ${innerRadius} 0 0 0 ${point(start, innerRadius)}
    Z
  `;
}

function CamelotWheel({
  notation,
  onChordDown,
  onChordUp,
}: {
  notation: Notation;
  onChordDown?: (chord: CamelotChord) => void;
  onChordUp?: (chord: CamelotChord) => void;
}) {
  const [selected, setSelected] = useState<CamelotChord | null>(null);
  const playingRef = useRef<CamelotChord | null>(null);

  const play = (chord: CamelotChord) => {
    playingRef.current = chord;
    setSelected(chord);
    onChordDown?.(chord);
  };

  const stop = () => {
    const current = playingRef.current;
    if (current == null) {
      return;
    }
    playingRef.current = null;
    setSelected(null);
    onChordUp?.(current);
  };

  const onPointerDown = (chord: CamelotChord) => {
    play(chord);
    document.addEventListener("pointerup", stop, { once: true });
  };

  // Dragging across the wheel moves to the chord under the pointer
  const onPointerEnter = (chord: CamelotChord) => {
    const current = playingRef.current;
    if (current == null || current === chord) {
      return;
    }
    stop();
    play(chord);
  };

  return (
    <svg
      width="300"
      height="300"
      viewBox="-150 -150 300 300"
      className="max-w-full touch-none select-none"
    >
      {RINGS.map((ring) =>
        ring.keys.map((k, i) => {
          const labelAngle = (i + 0.5) * SLICE_ANGLE - Math.PI / 2;
          const labelRadius = (ring.innerRadius + ring.outerRadius) / 2;

          return (
            <g key={k.camelot}>
              <path
                d={slicePath(i, ring.innerRadius, ring.outerRadius)}
                fill={selected === k.camelot ? ring.selectedFill : ring.fill}
                stroke={ring.stroke}
                strokeWidth={1}
                className="cursor-pointer"
                onPointerDown={() => onPointerDown(k.camelot)}
                onPointerEnter={() => onPointerEnter(k.camelot)}
              />
              <text
                x={Math.cos(labelAngle) * labelRadius}
                y={Math.sin(labelAngle) * labelRadius}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={ring.fontSize}
                fill="#111"
                className="pointer-events-none"
              >
                {notation === "camelot" ? k.camelot : k.musical}
              </text>
            </g>
          );
        })
      )}
    </svg>
  );
}

export default CamelotWheel;
