-- Debug script for treesitter-context and textobjects
-- Run this in nvim with: :luafile debug-treesitter.lua

print('=== Treesitter Diagnostics ===\n')

-- Check if plugins are loaded
local has_ts, ts = pcall(require, 'nvim-treesitter')
print('1. nvim-treesitter loaded:', has_ts)

local has_ctx, ctx = pcall(require, 'treesitter-context')
print('2. treesitter-context loaded:', has_ctx)

if has_ctx then
  print('   - Context enabled:', ctx.enabled())
  print('   - Try :TSContextToggle to toggle')
end

-- Check textobjects configuration
local has_tsconfig, tsconfig = pcall(require, 'nvim-treesitter.configs')
if has_tsconfig then
  local move_config = tsconfig.get_module('textobjects.move')
  if move_config then
    print('\n3. Textobjects move config:')
    print('   - Enabled:', move_config.enable)
    print('   - [[  maps to:', move_config.goto_previous_start['[['])
    print('   - ]]  maps to:', move_config.goto_next_start[']]'])
    print('   - Loaded:', move_config.loaded)
  else
    print('\n3. ERROR: textobjects.move not configured!')
  end
else
  print('\n3. ERROR: nvim-treesitter.configs not found!')
end

-- Check current buffer parser
print('\n4. Current buffer:')
local bufnr = vim.api.nvim_get_current_buf()
local ft = vim.bo[bufnr].filetype
print('   - Filetype:', ft)

local has_parser = pcall(vim.treesitter.get_parser, bufnr)
print('   - Parser available:', has_parser)

if has_parser then
  local parser = vim.treesitter.get_parser(bufnr)
  print('   - Parser lang:', parser:lang())
end

-- Test if mappings work
print('\n5. Key mappings:')
local function check_map(key)
  local maps = vim.api.nvim_get_keymap('n')
  for _, map in ipairs(maps) do
    if map.lhs == key then
      return map.rhs or map.callback
    end
  end

  local buf_maps = vim.api.nvim_buf_get_keymap(0, 'n')
  for _, map in ipairs(buf_maps) do
    if map.lhs == key then
      return map.rhs or map.callback
    end
  end

  return 'not mapped'
end

print('   - [[ → ', check_map('[['))
print('   - ]] → ', check_map(']]'))

-- Check TSContext commands
print('\n6. Available commands:')
local commands = vim.api.nvim_get_commands({})
local has_tscontext = false
for name, _ in pairs(commands) do
  if name:match('^TSContext') then
    print('   -', name)
    has_tscontext = true
  end
end
if not has_tscontext then
  print('   - No TSContext commands found (context not loaded?)')
end

print('\n=== Diagnostic Complete ===')
print('\nSuggested actions:')
print('1. If context is enabled but not visible:')
print('   - Make sure you are in a TSX/TS file')
print('   - Navigate inside a function (line 300+)')
print('   - Try :TSContextToggle twice to reset')
print('')
print('2. If [[ and ]] don\'t work:')
print('   - Check if they show as mapped above')
print('   - Try manually: :lua require("nvim-treesitter.textobjects.move").goto_previous_start("@function.outer")')
print('')
print('3. If neither work:')
print('   - Restart nvim')
print('   - Run :Lazy sync')
print('   - Run :TSUpdate')
