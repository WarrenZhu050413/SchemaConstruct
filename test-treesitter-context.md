# Testing Treesitter Context

## Test Instructions

1. Open this file in nvim: `nvim src/canvas/Canvas.tsx`

2. Navigate to around line 300 (inside a function)

3. **Expected behavior:**
   - You should see a sticky header at the top showing the function name you're currently in
   - Example: `function CanvasInner() {` should appear at the top even when you scroll down

4. **Test navigation with `[[` and `]]`:**
   - Press `[[` to jump to previous function (should work now!)
   - Press `]]` to jump to next function
   - Try navigating between: `CanvasInner`, `initializeShortcuts`, `createShortcutHandler`, `handleTagFilter`, etc.

5. **Commands to verify:**
   - `:TSContextToggle` - Toggle context on/off to see the difference
   - `:TSContextEnable` - Re-enable if disabled
   - `:checkhealth nvim-treesitter` - Verify treesitter is healthy

## Functions in Canvas.tsx (for testing):

Line 41: `function CanvasInner()`
Line 154: `const initializeShortcuts = async () => {`
Line 178: `const createShortcutHandler = (id: string) => {`
Line 247: `const handleTagFilter = (index: number) => {`
Line 263: `const showFeedback = useCallback((message: string) => {`
Line 274: `const deleteSelectedCards = useCallback(async () => {`
Line 320: `const handleOpenSettings = () => {`
Line 328: `const handleOpenSidePanel = async () => {`
Line 357: `const handleCreateNote = async () => {`
Line 397: `const handleToggleConnectionMode = () => {`
Line 403: `const handleNodeClick = async (_event: React.MouseEvent, node: any) => {`
Line 421: `const handleEdgeSubmit = async (type: ConnectionType, label: string) => {`
Line 788: `export function Canvas() {`

## Troubleshooting

If context doesn't show:
1. Run `:Lazy sync` to install the plugins
2. Restart nvim
3. Run `:TSUpdate` to update treesitter parsers
4. Run `:checkhealth nvim-treesitter-context`

If `[[`/`]]` still jumps to file start/end:
1. Check that treesitter-textobjects is loaded: `:Lazy`
2. Verify the config was applied: `:lua print(vim.inspect(require('nvim-treesitter.configs').get_module('textobjects')))`
