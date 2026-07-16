import test from "node:test";
import assert from "node:assert/strict";
import { wordForward, WORDForward, charLeft, charRight, goToLastLine } from "../motions.js";
import { handleNormalMode, type NormalModeContext } from "../modes/normal.js";
import { handleInsertMode, type InsertModeContext } from "../modes/insert.js";
import { handleVisualMode, type VisualModeContext } from "../modes/visual.js";
import { createInitialState } from "../state.js";
import { ESCAPE_SEQS } from "../keys.js";
import { moveEditorCursorTo } from "../cursor.js";

function editor(initial: string, line = 0, col = 0) {
  let text = initial;
  let cursor = { line, col };
  const state = createInitialState();
  state.mode = "normal";

  const input = (data: string) => {
    const lines = text.split("\n");
    if (data === ESCAPE_SEQS.home) cursor.col = 0;
    else if (data === ESCAPE_SEQS.up) cursor.line = Math.max(0, cursor.line - 1);
    else if (data === ESCAPE_SEQS.down) cursor.line = Math.min(lines.length - 1, cursor.line + 1);
    else if (data === ESCAPE_SEQS.left) {
      // Base editor wraps to the end of the previous line
      if (cursor.col > 0) cursor.col--;
      else if (cursor.line > 0) {
        cursor.line--;
        cursor.col = (lines[cursor.line] || "").length;
      }
    } else if (data === ESCAPE_SEQS.right) {
      // Base editor wraps to the start of the next line
      if (cursor.col < (lines[cursor.line] || "").length) cursor.col++;
      else if (cursor.line < lines.length - 1) {
        cursor.line++;
        cursor.col = 0;
      }
    } else if (data === ESCAPE_SEQS.newline) {
      const current = lines[cursor.line] || "";
      lines.splice(cursor.line, 1, current.slice(0, cursor.col), current.slice(cursor.col));
      text = lines.join("\n");
      cursor = { line: cursor.line + 1, col: 0 };
    } else if (!data.startsWith("\x1b")) {
      const current = lines[cursor.line] || "";
      lines[cursor.line] = current.slice(0, cursor.col) + data + current.slice(cursor.col);
      text = lines.join("\n");
      cursor.col += data.length;
    }
  };

  const normal: NormalModeContext = {
    state,
    superHandleInput: input,
    getText: () => text,
    getCursor: () => ({ ...cursor }),
    setText: value => { text = value; cursor = { line: value.split("\n").length - 1, col: value.split("\n").at(-1)!.length }; },
    moveCursorTo: (targetLine, targetCol) => { cursor = { line: targetLine, col: targetCol }; },
    undo() {}, redo() {},
  };
  const insert: InsertModeContext = { ...normal, superHandleInput: input };
  const visual: VisualModeContext = { ...normal, superHandleInput: input };
  return {
    state,
    normal,
    insert,
    key: (key: string) => handleNormalMode(key, normal),
    vkey: (key: string) => handleVisualMode(key, visual),
    type: input,
    escape: () => handleInsertMode("\x1b", insert),
    text: () => text,
    cursor: () => cursor,
  };
}

test("w and W skip indentation after crossing a line", () => {
  const lines = ["foo", "  bar"];
  assert.deepEqual(wordForward(lines, { line: 0, col: 0 }, 1).position, { line: 1, col: 2 });
  assert.deepEqual(WORDForward(lines, { line: 0, col: 0 }, 1).position, { line: 1, col: 2 });
});

test("word movement treats Unicode letters as a word", () => {
  assert.deepEqual(wordForward(["café next"], { line: 0, col: 0 }, 1).position, { line: 0, col: 5 });
});

test("cw behaves as ce and leaves following whitespace", () => {
  const e = editor("foo bar");
  e.key("c"); e.key("w"); e.type("X"); e.escape();
  assert.equal(e.text(), "X bar");
});

test("single dw at end of line preserves newline", () => {
  const e = editor("foo\n  bar baz");
  e.key("d"); e.key("w");
  assert.equal(e.text(), "\n  bar baz");
});

test("operator and motion counts multiply", () => {
  const e = editor("one two three four five six seven");
  e.key("2"); e.key("d"); e.key("3"); e.key("w");
  assert.equal(e.text(), "seven");
});

test("O opens an auto-indented line without replacing the buffer", () => {
  const e = editor("  foo\nbar", 0, 1);
  e.key("O"); e.type("X"); e.escape();
  assert.equal(e.text(), "  X\n  foo\nbar");
  assert.deepEqual(e.cursor(), { line: 0, col: 2 });
});

// --- h/l around line boundaries (Vim: h/l never cross lines) ---

test("l stops on the last character and does not wrap to the next line", () => {
  const e = editor("hello\nworld", 0, 4);
  e.key("l");
  assert.deepEqual(e.cursor(), { line: 0, col: 4 });
  e.key("l");
  assert.deepEqual(e.cursor(), { line: 0, col: 4 });
});

test("counted l clamps at the line end", () => {
  const e = editor("hello\nworld", 0, 0);
  e.key("1"); e.key("0"); e.key("l");
  assert.deepEqual(e.cursor(), { line: 0, col: 4 });
});

test("l on an empty line stays at column 0", () => {
  const e = editor("foo\n\nbar", 1, 0);
  e.key("l");
  assert.deepEqual(e.cursor(), { line: 1, col: 0 });
});

test("h stops at column 0 and does not wrap to the previous line", () => {
  const e = editor("hello\nworld", 1, 1);
  e.key("h");
  assert.deepEqual(e.cursor(), { line: 1, col: 0 });
  e.key("h");
  assert.deepEqual(e.cursor(), { line: 1, col: 0 });
});

test("counted h clamps at column 0", () => {
  const e = editor("hello\nworld", 1, 3);
  e.key("1"); e.key("0"); e.key("h");
  assert.deepEqual(e.cursor(), { line: 1, col: 0 });
});

test("visual mode l stops on the last character of the line", () => {
  const e = editor("hello\nworld", 0, 0);
  e.key("v");
  for (let i = 0; i < 8; i++) e.vkey("l");
  assert.deepEqual(e.cursor(), { line: 0, col: 4 });
});

test("visual mode h stops at column 0", () => {
  const e = editor("hello\nworld", 1, 2);
  e.key("v");
  for (let i = 0; i < 5; i++) e.vkey("h");
  assert.deepEqual(e.cursor(), { line: 1, col: 0 });
});

test("charLeft/charRight motions stay on the same line", () => {
  const lines = ["hello", "world"];
  assert.deepEqual(charRight(lines, { line: 0, col: 4 }, 1).position, { line: 0, col: 4 });
  assert.deepEqual(charRight(lines, { line: 0, col: 0 }, 99).position, { line: 0, col: 4 });
  assert.deepEqual(charLeft(lines, { line: 1, col: 0 }, 1).position, { line: 1, col: 0 });
  assert.deepEqual(charLeft(lines, { line: 1, col: 4 }, 99).position, { line: 1, col: 0 });
});

// --- dl/dh at line boundaries ---

test("dl at the last character deletes it without joining lines", () => {
  const e = editor("hello\nworld", 0, 4);
  e.key("d"); e.key("l");
  assert.equal(e.text(), "hell\nworld");
  assert.deepEqual(e.cursor(), { line: 0, col: 3 });
});

test("dh at column 0 does nothing", () => {
  const e = editor("hello\nworld", 1, 0);
  e.key("d"); e.key("h");
  assert.equal(e.text(), "hello\nworld");
});

// --- x/X at line boundaries (Vim: never join lines) ---

test("x at end of line deletes last char and clamps cursor, never joins", () => {
  const e = editor("hello\nworld", 0, 4);
  e.key("x");
  assert.equal(e.text(), "hell\nworld");
  assert.deepEqual(e.cursor(), { line: 0, col: 3 });
  e.key("x");
  assert.equal(e.text(), "hel\nworld");
  assert.deepEqual(e.cursor(), { line: 0, col: 2 });
});

test("x on an empty line does nothing", () => {
  const e = editor("foo\n\nbar", 1, 0);
  e.key("x");
  assert.equal(e.text(), "foo\n\nbar");
  assert.deepEqual(e.cursor(), { line: 1, col: 0 });
});

test("counted x clamps to the line end without joining", () => {
  const e = editor("hello\nworld", 0, 2);
  e.key("1"); e.key("0"); e.key("x");
  assert.equal(e.text(), "he\nworld");
  assert.deepEqual(e.cursor(), { line: 0, col: 1 });
});

test("X at column 0 does nothing", () => {
  const e = editor("hello\nworld", 1, 0);
  e.key("X");
  assert.equal(e.text(), "hello\nworld");
  assert.deepEqual(e.cursor(), { line: 1, col: 0 });
});

test("counted X deletes before the cursor, clamped to line start", () => {
  const e = editor("hello\nworld", 0, 4);
  e.key("3"); e.key("X");
  assert.equal(e.text(), "ho\nworld");
  assert.deepEqual(e.cursor(), { line: 0, col: 1 });
});

// --- G / gg target logical lines ---

test("G moves to the first non-blank of the last line", () => {
  const e = editor("foo\nbar\n   indented", 0, 1);
  e.key("G");
  assert.deepEqual(e.cursor(), { line: 2, col: 3 });
});

test("counted G moves to that line's first non-blank", () => {
  const e = editor("foo\n   bar\nbaz", 0, 0);
  e.key("2"); e.key("G");
  assert.deepEqual(e.cursor(), { line: 1, col: 3 });
});

test("gg moves to the first non-blank of the first line", () => {
  const e = editor("   foo\nbar", 1, 2);
  e.key("g"); e.key("g");
  assert.deepEqual(e.cursor(), { line: 0, col: 3 });
});

test("goToLastLine targets logical lines regardless of display wrapping", () => {
  // A very long first line would wrap over many visual rows; the motion must
  // still treat it as a single logical line.
  const longLine = "a".repeat(500);
  const lines = [longLine, "short"];
  assert.deepEqual(goToLastLine(lines, { line: 0, col: 0 }, lines.length).position, { line: 1, col: 0 });
});

test("moveEditorCursorTo sets the logical cursor position directly", () => {
  // moveCursorTo must not emulate arrow keys: the base editor moves by
  // visual (wrapped) rows, which lands on the wrong logical line when a
  // line wraps. Setting state directly is wrap-independent.
  const longLine = "a".repeat(500);
  const fake = {
    state: { lines: [longLine, "short", "  last"], cursorLine: 0, cursorCol: 0 },
    lastAction: {} as unknown,
    preferredVisualCol: 3 as number | null,
    setCursorCol(col: number) {
      this.state.cursorCol = col;
      this.preferredVisualCol = null;
    },
  };

  moveEditorCursorTo(fake, 2, 2);
  assert.equal(fake.state.cursorLine, 2);
  assert.equal(fake.state.cursorCol, 2);
  assert.equal(fake.lastAction, null);
  assert.equal(fake.preferredVisualCol, null);

  // Clamps line and column to the buffer
  moveEditorCursorTo(fake, 99, 99);
  assert.equal(fake.state.cursorLine, 2);
  assert.equal(fake.state.cursorCol, 6);
});

test("counted O repeats the inserted line like Vim", () => {
  const e = editor("  foo\nbar", 0, 0);
  e.key("3"); e.key("O"); e.type("X"); e.escape();
  assert.equal(e.text(), "  X\n  X\n  X\n  foo\nbar");
  assert.deepEqual(e.cursor(), { line: 2, col: 2 });
});
