import { useCallback, useMemo, useReducer } from "react";
import type { Note } from "./notes";

const MAX_HISTORY = 200;

interface History {
  notes: Note[];
  past: Note[][];
  future: Note[][];
}

type Action =
  | { type: "update"; update: (notes: Note[]) => Note[] }
  /** Save the current notes to the undo history, then optionally update */
  | { type: "commit"; update?: (notes: Note[]) => Note[] }
  | { type: "undo" }
  | { type: "redo" }
  /** Replace the notes and clear the history */
  | { type: "reset"; notes: Note[] };

function reducer(state: History, action: Action): History {
  switch (action.type) {
    case "update":
      return { ...state, notes: action.update(state.notes) };
    case "commit":
      return {
        notes: action.update ? action.update(state.notes) : state.notes,
        past: [...state.past.slice(-(MAX_HISTORY - 1)), state.notes],
        future: [],
      };
    case "undo":
      if (state.past.length === 0) return state;
      return {
        notes: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.notes, ...state.future],
      };
    case "redo":
      if (state.future.length === 0) return state;
      return {
        notes: state.future[0],
        past: [...state.past, state.notes],
        future: state.future.slice(1),
      };
    case "reset":
      return { notes: action.notes, past: [], future: [] };
  }
}

/**
 * Notes with undo/redo. Every action works off the latest state, so it's
 * safe to call from native event listeners that may hold stale closures.
 */
export function useNoteHistory() {
  const [state, dispatch] = useReducer(reducer, {
    notes: [],
    past: [],
    future: [],
  });

  const setNotes = useCallback(
    (update: (notes: Note[]) => Note[]) => dispatch({ type: "update", update }),
    [],
  );
  const actions = useMemo(
    () => ({
      setNotes,
      checkpoint: () => dispatch({ type: "commit" }),
      commit: (update: (notes: Note[]) => Note[]) =>
        dispatch({ type: "commit", update }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
      reset: (notes: Note[] = []) => dispatch({ type: "reset", notes }),
    }),
    [setNotes],
  );

  return {
    notes: state.notes,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    ...actions,
  };
}
