import test from "node:test";
import assert from "node:assert/strict";
import { wordForward, WORDForward } from "../motions.js";
import { handleNormalMode, type NormalModeContext } from "../modes/normal.js";
import { handleInsertMode, type InsertModeContext } from "../modes/insert.js";
import { createInitialState } from "../state.js";
import { ESCAPE_SEQS } from "../keys.js";

function editor(initial: string, line = 0, col = 0) {
  let text = initial;
  let cursor = { line, col };
  const state = createInitialState();
  state.mode = "normal";

  const input = (data: string) => {
    const lines = text.split("\n");
    if (data === ESCAPE_SEQS.home) cursor.col = 0;
    else if (data === ESCAPE_SEQS.up) cursor.line = Math.max(0, cursor.line - 1);
    else if (data === ESCAPE_SEQS.left) cursor.col = Math.max(0, cursor.col - 1);
    else if (data === ESCAPE_SEQS.newline) {
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
  return { state, normal, insert, key: (key: string) => handleNormalMode(key, normal), type: input, escape: () => handleInsertMode("\x1b", insert), text: () => text, cursor: () => cursor };
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

test("counted O repeats the inserted line like Vim", () => {
  const e = editor("  foo\nbar", 0, 0);
  e.key("3"); e.key("O"); e.type("X"); e.escape();
  assert.equal(e.text(), "  X\n  X\n  X\n  foo\nbar");
  assert.deepEqual(e.cursor(), { line: 2, col: 2 });
});
