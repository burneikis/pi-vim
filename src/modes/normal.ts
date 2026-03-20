/**
 * Normal mode handler.
 * Implements vim motions, mode switching, count prefixes, and pending key states.
 */

import type { VimState } from "../state.js";
import { resetOperatorState } from "../state.js";
import { isDigit, ESCAPE_SEQS } from "../keys.js";
import {
  wordForward,
  wordBackward,
  wordEnd,
  WORDForward,
  WORDBackward,
  WORDEnd,
  goToFirstLine,
  goToLastLine,
  firstNonBlank,
  lineStart,
  lineEnd,
  findCharForward,
  findCharBackward,
  tillCharForward,
  tillCharBackward,
  repeatCharSearch,
  reverseCharSearch,
  paragraphBackward,
  paragraphForward,
  matchingBracket,
  type MotionFn,
} from "../motions.js";

export interface NormalModeContext {
  state: VimState;
  superHandleInput: (data: string) => void;
  getText: () => string;
  getCursor: () => { line: number; col: number };
  setText: (text: string) => void;
  moveCursorTo: (line: number, col: number) => void;
}

/**
 * Execute a motion and move the cursor to the result.
 */
function executeMotion(
  motion: MotionFn,
  ctx: NormalModeContext,
  count: number,
): void {
  const lines = ctx.getText().split("\n");
  const cursor = ctx.getCursor();
  const result = motion(lines, cursor, count);
  ctx.moveCursorTo(result.position.line, result.position.col);
}

/**
 * Handle input in normal mode.
 * Returns true if the key was handled.
 */
export function handleNormalMode(data: string, ctx: NormalModeContext): boolean {
  const { state } = ctx;

  // --- Pending character input for f/F/t/T/r ---
  if (state.pendingCharMotion) {
    const pending = state.pendingCharMotion;
    state.pendingCharMotion = null;

    // Only accept single printable characters
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      const count = state.count || 1;
      let motionFn: MotionFn;

      switch (pending) {
        case "f":
          motionFn = findCharForward(data);
          break;
        case "F":
          motionFn = findCharBackward(data);
          break;
        case "t":
          motionFn = tillCharForward(data);
          break;
        case "T":
          motionFn = tillCharBackward(data);
          break;
        case "r":
          // Replace character under cursor
          replaceChar(data, ctx, count);
          resetOperatorState(state);
          return true;
        default:
          resetOperatorState(state);
          return true;
      }

      executeMotion(motionFn, ctx, count);
      resetOperatorState(state);
      return true;
    }

    // Non-printable cancels the pending motion
    resetOperatorState(state);
    return true;
  }

  // --- Pending `g` prefix ---
  if (state.pendingG) {
    state.pendingG = false;

    if (data === "g") {
      // `gg` - go to first line (or line N)
      const count = state.count || 1;
      const countExplicit = state.countStarted;
      executeMotion(goToFirstLine, ctx, countExplicit ? count : 1);
      resetOperatorState(state);
      return true;
    }

    // Unrecognized g-command, cancel
    resetOperatorState(state);
    return true;
  }

  // Count prefix handling: 1-9 start a count, 0 continues if already started
  if (isDigit(data) && (data !== "0" || state.countStarted)) {
    state.count = state.count * 10 + parseInt(data, 10);
    state.countStarted = true;
    return true;
  }

  const count = state.count || 1;
  const countExplicit = state.countStarted;

  switch (data) {
    // === Basic directional motions ===
    case "h":
      for (let i = 0; i < count; i++) ctx.superHandleInput(ESCAPE_SEQS.left);
      resetOperatorState(state);
      return true;

    case "j":
      for (let i = 0; i < count; i++) ctx.superHandleInput(ESCAPE_SEQS.down);
      resetOperatorState(state);
      return true;

    case "k":
      for (let i = 0; i < count; i++) ctx.superHandleInput(ESCAPE_SEQS.up);
      resetOperatorState(state);
      return true;

    case "l":
      for (let i = 0; i < count; i++) ctx.superHandleInput(ESCAPE_SEQS.right);
      resetOperatorState(state);
      return true;

    // === Line motions ===
    case "0":
      executeMotion(lineStart, ctx, 1);
      resetOperatorState(state);
      return true;

    case "$":
      executeMotion(lineEnd, ctx, count);
      resetOperatorState(state);
      return true;

    case "^":
      executeMotion(firstNonBlank, ctx, 1);
      resetOperatorState(state);
      return true;

    // === Word motions ===
    case "w":
      executeMotion(wordForward, ctx, count);
      resetOperatorState(state);
      return true;

    case "b":
      executeMotion(wordBackward, ctx, count);
      resetOperatorState(state);
      return true;

    case "e":
      executeMotion(wordEnd, ctx, count);
      resetOperatorState(state);
      return true;

    case "W":
      executeMotion(WORDForward, ctx, count);
      resetOperatorState(state);
      return true;

    case "B":
      executeMotion(WORDBackward, ctx, count);
      resetOperatorState(state);
      return true;

    case "E":
      executeMotion(WORDEnd, ctx, count);
      resetOperatorState(state);
      return true;

    // === Find/Till character motions ===
    case "f":
    case "F":
    case "t":
    case "T":
      state.pendingCharMotion = data;
      return true;

    // === Repeat char search ===
    case ";":
      executeMotion(repeatCharSearch, ctx, count);
      resetOperatorState(state);
      return true;

    case ",":
      executeMotion(reverseCharSearch, ctx, count);
      resetOperatorState(state);
      return true;

    // === Line-level motions ===
    case "g":
      state.pendingG = true;
      return true;

    case "G":
      // G without count → last line, G with count → line N
      if (countExplicit) {
        executeMotion(goToLastLine, ctx, count);
      } else {
        const lines = ctx.getText().split("\n");
        executeMotion(goToLastLine, ctx, lines.length);
      }
      resetOperatorState(state);
      return true;

    // === Paragraph motions ===
    case "{":
      executeMotion(paragraphBackward, ctx, count);
      resetOperatorState(state);
      return true;

    case "}":
      executeMotion(paragraphForward, ctx, count);
      resetOperatorState(state);
      return true;

    // === Matching bracket ===
    case "%":
      executeMotion(matchingBracket, ctx, 1);
      resetOperatorState(state);
      return true;

    // === Insert mode entry ===
    case "i":
      state.mode = "insert";
      resetOperatorState(state);
      return true;

    case "a":
      state.mode = "insert";
      ctx.superHandleInput(ESCAPE_SEQS.right);
      resetOperatorState(state);
      return true;

    case "I": {
      // Insert at first non-whitespace
      const lines = ctx.getText().split("\n");
      const cursor = ctx.getCursor();
      const line = lines[cursor.line] || "";
      const match = line.match(/^\s*/);
      const targetCol = match ? match[0].length : 0;
      ctx.moveCursorTo(cursor.line, targetCol);
      state.mode = "insert";
      resetOperatorState(state);
      return true;
    }

    case "A":
      ctx.superHandleInput(ESCAPE_SEQS.end);
      state.mode = "insert";
      resetOperatorState(state);
      return true;

    case "o": {
      // Open line below
      const lines = ctx.getText().split("\n");
      const cursor = ctx.getCursor();
      lines.splice(cursor.line + 1, 0, "");
      ctx.setText(lines.join("\n"));
      ctx.moveCursorTo(cursor.line + 1, 0);
      state.mode = "insert";
      resetOperatorState(state);
      return true;
    }

    case "O": {
      // Open line above
      const lines = ctx.getText().split("\n");
      const cursor = ctx.getCursor();
      lines.splice(cursor.line, 0, "");
      ctx.setText(lines.join("\n"));
      ctx.moveCursorTo(cursor.line, 0);
      state.mode = "insert";
      resetOperatorState(state);
      return true;
    }

    // === Basic editing ===
    case "x": {
      for (let i = 0; i < count; i++) {
        ctx.superHandleInput(ESCAPE_SEQS.delete);
      }
      resetOperatorState(state);
      return true;
    }

    case "X": {
      for (let i = 0; i < count; i++) {
        ctx.superHandleInput(ESCAPE_SEQS.backspace);
      }
      resetOperatorState(state);
      return true;
    }

    case "r":
      // Replace character - wait for next char
      state.pendingCharMotion = "r";
      return true;

    default:
      break;
  }

  // If we have an unrecognized key, reset count and pass control sequences through
  resetOperatorState(state);

  // Pass control sequences to super for app keybindings (ctrl+d, etc.)
  if (data.length === 1 && data.charCodeAt(0) < 32) {
    ctx.superHandleInput(data);
    return true;
  }

  // Pass escape sequences through
  if (data.length > 1 && data.startsWith("\x1b")) {
    ctx.superHandleInput(data);
    return true;
  }

  // Ignore unrecognized printable characters in normal mode
  return true;
}

/**
 * Replace character under cursor with given char, repeated `count` times.
 */
function replaceChar(
  char: string,
  ctx: NormalModeContext,
  count: number,
): void {
  const lines = ctx.getText().split("\n");
  const cursor = ctx.getCursor();
  const line = lines[cursor.line] || "";

  // Replace `count` characters starting at cursor
  const end = Math.min(cursor.col + count, line.length);
  if (cursor.col >= line.length) return;

  const newLine =
    line.substring(0, cursor.col) +
    char.repeat(end - cursor.col) +
    line.substring(end);
  lines[cursor.line] = newLine;
  ctx.setText(lines.join("\n"));
  // Cursor stays at the last replaced character (or cursor.col if count=1)
  ctx.moveCursorTo(cursor.line, end - 1);
}
