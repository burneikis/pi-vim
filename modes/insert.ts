/**
 * Insert mode handler.
 * Passes all keys through to the base editor except Escape/Ctrl+[.
 * Tracks inserted text for dot-repeat.
 */

import type { VimState } from "../state.js";
import { matchesKey } from "@mariozechner/pi-tui";
import {
  isCurrentlyRecording,
  isRecordingInsertMode,
  recordInsertText,
  recordInsertBackspace,
  finalizeRecording,
} from "../repeat.js";

export interface InsertModeContext {
  state: VimState;
  getCursor: () => { line: number; col: number };
  getText: () => string;
  setText: (text: string) => void;
  moveCursorTo: (line: number, col: number) => void;
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
    const cursor = ctx.getCursor();
    if (ctx.state.openLineRepeatCount > 1) {
      const lines = ctx.getText().split("\n");
      const insertedLine = lines[cursor.line] || "";
      const copies = Array(ctx.state.openLineRepeatCount - 1).fill(insertedLine);
      lines.splice(cursor.line + 1, 0, ...copies);
      ctx.setText(lines.join("\n"));
      const targetLine = cursor.line + copies.length;
      ctx.moveCursorTo(targetLine, Math.max(0, cursor.col - 1));
      ctx.state.openLineRepeatCount = 1;
    } else if (cursor.col > 0) {
      // Move cursor left one position (vim behavior: cursor moves back on Escape)
      // but only if not already at column 0 (to prevent moving up a line)
      ctx.superHandleInput("\x1b[D");
    }
    // Finalize dot-repeat recording when leaving insert mode
    if (isCurrentlyRecording()) {
      finalizeRecording();
    }
    return true;
  }

  // Ctrl+C → switch to normal mode (without pi's clear behavior)
  // We handle this ourselves to prevent the default ctrl+c behavior
  if (data === "\x03") {
    ctx.state.mode = "normal";
    if (isCurrentlyRecording()) {
      finalizeRecording();
    }
    return true;
  }

  // Track inserted text for dot-repeat
  if (isCurrentlyRecording() && isRecordingInsertMode()) {
    if (data === "\x7f") {
      // Backspace
      recordInsertBackspace();
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      // Printable character
      recordInsertText(data);
    } else if (data === "\n" || data === "\r") {
      // Newline
      recordInsertText("\n");
    }
  }

  // Everything else passes through to base editor
  ctx.superHandleInput(data);
  return true;
}
