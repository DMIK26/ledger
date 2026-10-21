import { create } from 'zustand';
import type { Answer } from '../domain/companion';
import type { StampKind } from '../domain/notes';
import type { SketchColor } from '../domain/sketch';

export type SketchToolChoice = 'pen' | 'highlighter' | 'eraser' | 'note' | 'stamp';

/** Session state for Doodle Studio: sketch mode and its tools, the notes panel, the pencil's caption. */
interface DoodleState {
  sketchOn: boolean;
  tool: SketchToolChoice;
  color: SketchColor;
  stamp: StampKind;
  /** Fading ink: strokes vanish after a few seconds and are never saved. */
  fade: boolean;
  notesOpen: boolean;
  /** The pencil's current answer, shown as a caption with an arrow. */
  caption: (Answer & { at: number }) | null;
  setSketch: (on: boolean) => void;
  toggleSketch: () => void;
  setTool: (tool: SketchToolChoice) => void;
  setColor: (color: SketchColor) => void;
  setStamp: (stamp: StampKind) => void;
  setFade: (fade: boolean) => void;
  setNotesOpen: (open: boolean) => void;
  showCaption: (answer: Answer | null) => void;
}

export const useDoodle = create<DoodleState>((set, get) => ({
  sketchOn: false,
  tool: 'pen',
  color: 'ink',
  stamp: 'star',
  fade: false,
  notesOpen: false,
  caption: null,
  setSketch: (on) => set({ sketchOn: on }),
  toggleSketch: () => set({ sketchOn: !get().sketchOn }),
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setStamp: (stamp) => set({ stamp, tool: 'stamp' }),
  setFade: (fade) => set({ fade }),
  setNotesOpen: (open) => set({ notesOpen: open }),
  showCaption: (answer) => set({ caption: answer ? { ...answer, at: Date.now() } : null }),
}));

/** The element a note or answer points at, or null when it is not on this page right now. */
export function findAnchor(anchor: string, root: ParentNode = document): Element | null {
  const safe = anchor.replace(/["\\]/g, '\\$&');
  return root.querySelector(`[data-anchor="${safe}"]`);
}
