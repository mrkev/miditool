import { useEffect, useRef, useState } from "react";
import { CamelotChord } from "./CamelotChord";

interface CamelotKey {
  camelot: CamelotChord;
  musical: string;
  type: "A" | "B";
}

const keys: CamelotKey[] = [
  { camelot: "1A", musical: "Abm", type: "A" },
  { camelot: "2A", musical: "Ebm", type: "A" },
  { camelot: "3A", musical: "Bbm", type: "A" },
  { camelot: "4A", musical: "Fm", type: "A" },
  { camelot: "5A", musical: "Cm", type: "A" },
  { camelot: "6A", musical: "Gm", type: "A" },
  { camelot: "7A", musical: "Dm", type: "A" },
  { camelot: "8A", musical: "Am", type: "A" },
  { camelot: "9A", musical: "Em", type: "A" },
  { camelot: "10A", musical: "Bm", type: "A" },
  { camelot: "11A", musical: "F#m", type: "A" },
  { camelot: "12A", musical: "Dbm", type: "A" },

  { camelot: "1B", musical: "B", type: "B" },
  { camelot: "2B", musical: "F#", type: "B" },
  { camelot: "3B", musical: "Db", type: "B" },
  { camelot: "4B", musical: "Ab", type: "B" },
  { camelot: "5B", musical: "Eb", type: "B" },
  { camelot: "6B", musical: "Bb", type: "B" },
  { camelot: "7B", musical: "F", type: "B" },
  { camelot: "8B", musical: "C", type: "B" },
  { camelot: "9B", musical: "G", type: "B" },
  { camelot: "10B", musical: "D", type: "B" },
  { camelot: "11B", musical: "A", type: "B" },
  { camelot: "12B", musical: "E", type: "B" },
];

function addListeners<K extends keyof SVGElementEventMap>(
  elems: SVGElement[],
  key: K,
  event: (this: SVGElement, ev: SVGElementEventMap[K]) => unknown
) {
  for (const elem of elems) {
    elem.addEventListener(key, event);
  }

  return () => {
    for (const elem of elems) {
      elem.removeEventListener(key, event);
    }
  };
}

function CamelotWheel({
  onChordClick,
  onChordDown,
  onChordUp,
}: {
  onChordClick?: (chord: CamelotChord) => void;
  onChordDown?: (chord: CamelotChord) => void;
  onChordUp?: (chord: CamelotChord) => void;
}) {
  const [notation, setNotation] = useState<"camelot" | "musical">("camelot");
  const [selected, setSelected] = useState<CamelotChord | null>(null);
  const wheelRefs = useRef(new Map<number, SVGPathElement>());
  const playingRef = useRef<CamelotChord | null>(null);

  const radiusOuter = 120;
  const radiusInner = 80;
  const sliceAngle = (2 * Math.PI) / 12;

  const onSelected = (chord: CamelotChord) => {
    // setSelected(chord);
    onChordClick?.(chord);
  };

  const onMouseDown = (chord: CamelotChord) => {
    setSelected(chord);
    onChordDown?.(chord);
  };

  const onMouseUp = (chord: CamelotChord) => {
    setSelected(null);
    onChordUp?.(chord);
  };

  useEffect(() => {
    const refs = [...wheelRefs.current.values()];

    const mouseEnter = (e: MouseEvent) => {
      const current = playingRef.current;
      if (current == null) {
        return;
      }

      const elem = e.target as SVGPathElement;
      const camelot = elem.getAttribute("data-camelot") as CamelotChord;
      if (current == camelot) {
        return;
      }

      onChordUp?.(current);
      playingRef.current = camelot;
      setSelected(camelot);
      onChordDown?.(camelot);

      // add mouse up
    };

    const mouseDown = (e: MouseEvent) => {
      const elem = e.target as SVGPathElement;
      const camelot = elem.getAttribute("data-camelot") as CamelotChord;
      onChordDown?.(camelot);
      playingRef.current = camelot;
      setSelected(camelot);

      console.log("DOWN", playingRef);

      const mouseUp = () => {
        console.log("UP");
        const current = playingRef.current;
        current && onChordUp?.(current);
        playingRef.current = null;
        setSelected(null);

        document.removeEventListener("pointerup", mouseUp);
      };

      // const mouseOut = () => {
      //   playingRef.current = null;
      //   onChordUp?.(camelot);
      //   elem.removeEventListener("pointerleave", mouseOut);
      // };

      document.addEventListener("pointerup", mouseUp);
      // elem.addEventListener("pointerleave", mouseOut);
    };

    for (const elem of refs) {
      elem.addEventListener("pointerdown", mouseDown);
      elem.addEventListener("mouseenter", mouseEnter);
    }

    return () => {
      for (const elem of refs) {
        elem.removeEventListener("pointerdown", mouseDown);
        elem.removeEventListener("mouseenter", mouseEnter);
      }
    };
  }, [onChordDown, onChordUp]);

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <h2 className="text-xl font-semibold">Camelot Wheel</h2>

      <button
        onClick={() =>
          setNotation(notation === "camelot" ? "musical" : "camelot")
        }
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Switch to {notation === "camelot" ? "Circle of Fifths" : "Camelot"}{" "}
        Notation
      </button>

      <svg
        width="300"
        height="300"
        viewBox="-150 -150 300 300"
        style={{ userSelect: "none" }}
      >
        {/* Outer (B) ring */}
        {keys
          .filter((k) => k.type === "B")
          .map((k, i) => {
            const startAngle = i * sliceAngle - Math.PI / 2;
            const endAngle = startAngle + sliceAngle;

            const x1 = Math.cos(startAngle) * radiusInner;
            const y1 = Math.sin(startAngle) * radiusInner;
            const x2 = Math.cos(endAngle) * radiusInner;
            const y2 = Math.sin(endAngle) * radiusInner;

            const x3 = Math.cos(endAngle) * radiusOuter;
            const y3 = Math.sin(endAngle) * radiusOuter;
            const x4 = Math.cos(startAngle) * radiusOuter;
            const y4 = Math.sin(startAngle) * radiusOuter;

            const pathData = `
              M ${x1} ${y1}
              L ${x4} ${y4}
              A ${radiusOuter} ${radiusOuter} 0 0 1 ${x3} ${y3}
              L ${x2} ${y2}
              A ${radiusInner} ${radiusInner} 0 0 0 ${x1} ${y1}
              Z
            `;

            const labelAngle = startAngle + sliceAngle / 2;
            const labelRadius = (radiusInner + radiusOuter) / 2;
            const lx = Math.cos(labelAngle) * labelRadius;
            const ly = Math.sin(labelAngle) * labelRadius;

            const isSelected = selected === k.camelot;

            return (
              <g key={k.camelot}>
                <path
                  ref={(elem) => {
                    if (elem == null) {
                      wheelRefs.current.delete(i);
                    } else {
                      wheelRefs.current.set(i, elem);
                    }
                  }}
                  d={pathData}
                  fill={isSelected ? "#60a5fa" : "#93c5fd"}
                  stroke="#1e3a8a"
                  strokeWidth={1}
                  data-camelot={k.camelot}
                  // onClick={() => onSelected(k.camelot)}
                  // onPointerDown={() => onMouseDown(k.camelot)}
                  // onPointerUp={() => onMouseUp(k.camelot)}
                  // onMouseLeave={() => onMouseUp(k.camelot)}
                  // onMouseEnter={(e) => e.onMouseDown(k.camelot)}
                  style={{ cursor: "pointer" }}
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="12"
                  fill="#111"
                  style={{ pointerEvents: "none" }}
                >
                  {notation === "camelot" ? k.camelot : k.musical}
                </text>
              </g>
            );
          })}

        {/* Inner (A) ring */}
        {keys
          .filter((k) => k.type === "A")
          .map((k, i) => {
            const startAngle = i * sliceAngle - Math.PI / 2;
            const endAngle = startAngle + sliceAngle;

            const x1 = Math.cos(startAngle) * 0;
            const y1 = Math.sin(startAngle) * 0;
            const x2 = Math.cos(endAngle) * 0;
            const y2 = Math.sin(endAngle) * 0;

            const innerRadius = 40;
            const outerRadius = radiusInner;

            const xi1 = Math.cos(startAngle) * innerRadius;
            const yi1 = Math.sin(startAngle) * innerRadius;
            const xi2 = Math.cos(endAngle) * innerRadius;
            const yi2 = Math.sin(endAngle) * innerRadius;

            const xo1 = Math.cos(startAngle) * outerRadius;
            const yo1 = Math.sin(startAngle) * outerRadius;
            const xo2 = Math.cos(endAngle) * outerRadius;
            const yo2 = Math.sin(endAngle) * outerRadius;

            const pathData = `
              M ${xi1} ${yi1}
              L ${xo1} ${yo1}
              A ${outerRadius} ${outerRadius} 0 0 1 ${xo2} ${yo2}
              L ${xi2} ${yi2}
              A ${innerRadius} ${innerRadius} 0 0 0 ${xi1} ${yi1}
              Z
            `;

            const labelAngle = startAngle + sliceAngle / 2;
            const labelRadius = (innerRadius + outerRadius) / 2;
            const lx = Math.cos(labelAngle) * labelRadius;
            const ly = Math.sin(labelAngle) * labelRadius;

            const isSelected = selected === k.camelot;

            return (
              <g key={k.camelot}>
                <path
                  d={pathData}
                  fill={isSelected ? "#34d399" : "#6ee7b7"}
                  stroke="#065f46"
                  strokeWidth={1}
                  onClick={() => onSelected(k.camelot)}
                  onPointerDown={() => onMouseDown(k.camelot)}
                  onPointerUp={() => onMouseUp(k.camelot)}
                  style={{ cursor: "pointer" }}
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="11"
                  fill="#111"
                  style={{ pointerEvents: "none" }}
                >
                  {notation === "camelot" ? k.camelot : k.musical}
                </text>
              </g>
            );
          })}
      </svg>
    </div>
  );
}

export default CamelotWheel;
