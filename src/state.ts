/**
 * Vim state machine - tracks current mode, pending operations, and repeat info.
 */

export type VimMode = "normal" | "insert" | "visual" | "visual-line" | "command-line" | "operator-pending";

export interface RecordedChange {
  /** The keys that triggered this change */
  keys: string[];
  /** Text inserted during insert mode (for dot-repeat) */
  insertedText: string;
}

export interface VimState {
  mode: VimMode;
  /** Numeric prefix accumulator (0 = none) */
  count: number;
  /** Pending operator: 'd', 'c', 'y', '>', '<', etc. */
  pendingOperator: string | null;
  /** Current register ('"' = default) */
  register: string;
  /** Last recorded change for dot-repeat */
  lastChange: RecordedChange | null;
  /** Anchor position for visual mode */
  visualAnchor: { line: number; col: number } | null;
  /** Whether we're accumulating digits for a count */
  countStarted: boolean;
  /** Pending character motion: 'f', 'F', 't', 'T', or 'r' (waiting for next char) */
  pendingCharMotion: string | null;
  /** Whether we're waiting for the second key after 'g' (e.g., gg) */
  pendingG: boolean;
}

export function createInitialState(): VimState {
  return {
    mode: "insert",
    count: 0,
    pendingOperator: null,
    register: '"',
    lastChange: null,
    visualAnchor: null,
    countStarted: false,
    pendingCharMotion: null,
    pendingG: false,
  };
}

export function resetOperatorState(state: VimState): void {
  state.count = 0;
  state.countStarted = false;
  state.pendingOperator = null;
  state.pendingCharMotion = null;
  state.pendingG = false;
}

export function modeDisplayName(mode: VimMode): string {
  switch (mode) {
    case "normal": return "NORMAL";
    case "insert": return "INSERT";
    case "visual": return "VISUAL";
    case "visual-line": return "V-LINE";
    case "command-line": return "COMMAND";
    case "operator-pending": return "OP-PENDING";
  }
}
