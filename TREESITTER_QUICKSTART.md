# Treesitter Context & Navigation Quick Start

## ✅ Configuration Status

Everything is configured correctly! Here's what's working:

1. **treesitter-context** - Sticky function headers ✅
2. **treesitter-textobjects** - Function navigation with `[[` and `]]` ✅
3. **TSX parser** - Working ✅

## How to Use

### 1. Sticky Context (Function Headers at Top)

The context bar shows **automatically** when:
- You're inside a function/class
- Your cursor is scrolled down inside that function

**Commands:**
```vim
:TSContext enable      " Turn on sticky context
:TSContext disable     " Turn off sticky context
:TSContext toggle      " Toggle on/off
```

**What you should see:**
When you scroll down inside a function (like line 300 in Canvas.tsx), you'll see the function signature "stuck" at the top of your window in a gray bar:

```
function CanvasInner() {                    ← This line stays at top
... your cursor is here on line 300 ...
```

### 2. Function Navigation

**Jump between functions:**
- `[[` - Jump to **previous** function start
- `]]` - Jump to **next** function start
- `[m` - Jump to previous class start
- `]m` - Jump to next class start

These work in **TypeScript, TSX, JavaScript, Python, Lua**, and most languages!

### 3. Jump to Context

When you're deep inside a function and want to jump to its header:

```vim
:lua require('treesitter-context').go_to_context()
```

Or add a keybinding (add to your keymaps.lua):
```lua
vim.keymap.set("n", "[c", function()
  require("treesitter-context").go_to_context()
end, { desc = "Jump to context (function start)" })
```

Then use `[c` to jump to the enclosing function!

## Quick Test

1. **Open Canvas.tsx:**
   ```bash
   nvim src/canvas/Canvas.tsx
   ```

2. **Navigate to line 300:**
   ```vim
   :300
   ```
   or just type `300G` in normal mode

3. **Look at the top of your window** - you should see:
   ```
   function CanvasInner() {
   ```
   in a gray bar (this is the context!)

4. **Test navigation:**
   - Press `[[` - should jump to previous function (line 274)
   - Press `]]` - should jump to next function (line 320)

5. **If context bar doesn't appear:**
   ```vim
   :TSContext toggle
   :TSContext toggle
   ```
   (toggle twice to reset)

## Troubleshooting

### Context bar not showing?

1. Make sure you're inside a function (not at the top of the file)
2. Try: `:TSContext toggle` twice
3. Check if enabled: `:lua print(require('treesitter-context').enabled())`
4. Should print `true`

### `[[` and `]]` not working?

1. Make sure you're in a file with functions (TSX, TS, JS, Python, etc.)
2. Try manually: `:lua require("nvim-treesitter.textobjects.move").goto_next_start("@function.outer")`
3. If that works, the mappings might be overridden - check `:nmap [[`

### Still not working?

Run the diagnostic:
```vim
:luafile debug-treesitter.lua
```

Should show everything as "true" and "loaded".

## Visual Example

Before (at line 41 - function start):
```
function CanvasInner() {
  const {
    nodes,
    edges,
  ...
```

After scrolling to line 300 (inside the function):
```
┌─────────────────────────────────────────────┐
│ function CanvasInner() {                    │  ← STICKY CONTEXT BAR
└─────────────────────────────────────────────┘
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) {
        return;
      }
```

The function signature stays visible even though you're 250+ lines down!

## Summary

- ✅ **Context works automatically** (no commands needed)
- ✅ **`[[` / `]]`** work in any language with treesitter support
- ✅ **`:TSContext toggle`** to turn on/off if needed
- ✅ Everything is configured correctly!

The context might be subtle - look for a gray bar at the very top of your nvim window showing the current function name!
