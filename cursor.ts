/**
 * Logical cursor positioning for the base editor.
 *
 * The base editor's arrow-key handling moves by *visual* (wrapped) rows, so
 * emulating vertical movement with arrow presses lands on the wrong logical
 * line whenever a line wraps (e.g. `G`, `gg`). Writing the editor state
 * directly is wrap-independent.
 */

export interface EditorLike {
  state: { lines: string[]; cursorLine: number; cursorCol: number };
  lastAction: unknown;
  preferredVisualCol?: number | null;
  setCursorCol?: (col: number) => void;
}

/**
 * Move the editor cursor to an absolute logical position, clamped to the
 * buffer. Column is allowed to be one past the last character (needed for
 * insert-mode positioning); normal-mode motions clamp themselves.
 */
export function moveEditorCursorTo(
  editor: EditorLike,
  targetLine: number,
  targetCol: number,
): void {
  const lines = editor.state.lines ?? [""];
  const line = Math.max(0, Math.min(targetLine, lines.length - 1));
  const col = Math.max(0, Math.min(targetCol, (lines[line] ?? "").length));
  editor.lastAction = null;
  editor.state.cursorLine = line;
  if (typeof editor.setCursorCol === "function") {
    editor.setCursorCol(col);
  } else {
    editor.state.cursorCol = col;
    editor.preferredVisualCol = null;
  }
}
