# pi-vim

Vim motions extension for [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). Replaces the default input editor with a vim-modal editor supporting normal, insert, visual, and replace modes.

## Install

```bash
pi install npm:@burneikis/pi-vim
```

### With Fuzzy File Picker (optional)

To add the [pi-fzfp](https://github.com/burneikis/pi-fzfp) fuzzy file picker, install it into pi-vim's package directory:

```bash
cd $(npm root -g)/@burneikis/pi-vim
npm install @burneikis/pi-fzfp
```

pi-vim detects pi-fzfp at startup and integrates it automatically.

> **Note:** The fuzzy file picker requires [`fd`](https://github.com/sharkdp/fd) on your `PATH`.
>
> **Do not install `@burneikis/pi-fzfp` as a separate pi package** — both extensions replace the editor, so loading both will cause a conflict.

## Features

### Vim Motions
- Normal, Insert, Visual, and Replace modes
- Motions (`h`, `j`, `k`, `l`, `w`, `b`, `e`, `0`, `$`, `gg`, `G`, etc.)
- Operators (`d`, `c`, `y`, `p`, etc.)
- Text objects (`iw`, `aw`, `i"`, `a(`, etc.)
- Search (`/`, `?`, `n`, `N`)
- Registers and yank/paste
- Dot repeat

### Fuzzy File Picker (optional)
- Replaces `@file` autocomplete with weighted dual-key fuzzy matching
- Basename matches scored 2× higher than path matches
- Suffix alignment bonus for extension-aware matching (`@acts` → `abct.ts` over `abct.scss`)
- Path prefix pre-filtering when query contains `/`
- Test file penalty as a tiebreaker
