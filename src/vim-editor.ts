/**
 * VimEditor - Modal vim editor extending CustomEditor.
 * Routes input to mode-specific handlers and renders mode indicator.
 */

import { CustomEditor } from "@mariozechner/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";
import type { TUI, EditorOptions, EditorTheme } from "@mariozechner/pi-tui";
import { createInitialState, modeDisplayName, type VimState } from "./state.js";
import { handleNormalMode, type NormalModeContext } from "./modes/normal.js";
import { handleInsertMode, type InsertModeContext } from "./modes/insert.js";
import { ESCAPE_SEQS } from "./keys.js";

export class VimEditor extends CustomEditor {
  public vimState: VimState;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: any,
    options?: EditorOptions,
  ) {
    super(tui, theme, keybindings, options);
    this.vimState = createInitialState();
  }

  handleInput(data: string): void {
    const { vimState } = this;

    switch (vimState.mode) {
      case "insert":
        this.handleInsert(data);
        break;

      case "normal":
        this.handleNormal(data);
        break;

      default:
        // For unimplemented modes, pass through to super
        super.handleInput(data);
        break;
    }
  }

  private handleInsert(data: string): void {
    const ctx: InsertModeContext = {
      state: this.vimState,
      getCursor: () => this.getCursor(),
      superHandleInput: (d) => super.handleInput(d),
    };
    handleInsertMode(data, ctx);
  }

  private handleNormal(data: string): void {
    // Escape in normal mode → pass to super (abort agent, etc.)
    if (matchesKey(data, "escape")) {
      super.handleInput(data);
      return;
    }

    const ctx: NormalModeContext = {
      state: this.vimState,
      superHandleInput: (d) => super.handleInput(d),
      getText: () => this.getText(),
      getCursor: () => this.getCursor(),
      setText: (text) => this.setText(text),
      moveCursorTo: (line, col) => this.moveCursorTo(line, col),
    };
    handleNormalMode(data, ctx);
  }

  /**
   * Move cursor to an absolute position by using escape sequences.
   * Re-reads getCursor() for accurate positioning (important after setText which moves to end).
   */
  moveCursorTo(targetLine: number, targetCol: number): void {
    const current = this.getCursor();

    // Move vertically
    if (targetLine < current.line) {
      for (let i = current.line; i > targetLine; i--) {
        super.handleInput(ESCAPE_SEQS.up);
      }
    } else if (targetLine > current.line) {
      for (let i = current.line; i < targetLine; i++) {
        super.handleInput(ESCAPE_SEQS.down);
      }
    }

    // Move to line start, then right to target column
    super.handleInput(ESCAPE_SEQS.home);
    for (let i = 0; i < targetCol; i++) {
      super.handleInput(ESCAPE_SEQS.right);
    }
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length === 0) return lines;

    // Add mode indicator to the bottom border (right side)
    const modeName = modeDisplayName(this.vimState.mode);
    const label = ` ${modeName} `;
    const last = lines.length - 1;
    if (visibleWidth(lines[last]!) >= label.length) {
      lines[last] =
        truncateToWidth(lines[last]!, width - label.length, "") + label;
    }

    return lines;
  }
}
