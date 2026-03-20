/**
 * Insert mode handler.
 * Passes all keys through to the base editor except Escape/Ctrl+[.
 */

import type { VimState } from "../state.js";
import { matchesKey } from "@mariozechner/pi-tui";

export interface InsertModeContext {
  state: VimState;
  getCursor: () => { line: number; col: number };
  superHandleInput: (data: string) => void;
}

/**
 * Handle input in insert mode.
 * Returns true if the key was handled, false if it should be passed to super.
 */
export function handleInsertMode(
  data: string,
  ctx: InsertModeContext,
): boolean {
  // Escape or Ctrl+[ → switch to normal mode
  if (matchesKey(data, "escape") || data === "\x1b") {
    ctx.state.mode = "normal";
    // Move cursor left one position (vim behavior: cursor moves back on Escape)
    // but only if not already at column 0 (to prevent moving up a line)
    if (ctx.getCursor().col > 0) {
      ctx.superHandleInput("\x1b[D");
    }
    return true;
  }

  // Ctrl+C → switch to normal mode (without pi's clear behavior)
  // We handle this ourselves to prevent the default ctrl+c behavior
  if (data === "\x03") {
    ctx.state.mode = "normal";
    return true;
  }

  // Everything else passes through to base editor
  ctx.superHandleInput(data);
  return true;
}
