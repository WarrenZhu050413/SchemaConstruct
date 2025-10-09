import { describe, it, expect } from 'vitest';
import { __test__ } from '../../../src/components/ElementChatWindow';

const { formatStreamingChunk } = __test__;

describe('ElementChatWindow streaming formatting', () => {
  it('inserts a newline when blockquote markers are merged into the same chunk', () => {
    const raw = '| I’m putting together details| **Tabs Permission**\n| - bullet';
    const formatted = formatStreamingChunk(raw, '');

    expect(formatted).toContain('details\n| **Tabs Permission**');
  });

  it('adds a newline when a chunk starts with a blockquote but the previous chunk lacked one', () => {
    const formatted = formatStreamingChunk('| **Tabs Permission**', 'Helpful context without newline');

    expect(formatted.startsWith('\n| **Tabs Permission**')).toBe(true);
  });

  it('leaves content unchanged when blockquote already starts on a new line', () => {
    const raw = '\n| **Tabs Permission**';
    const formatted = formatStreamingChunk(raw, 'Previous\n');

    expect(formatted).toBe(raw);
  });
});
