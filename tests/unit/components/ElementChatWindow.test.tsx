import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act, screen } from '@testing-library/react';
import { ElementChatWindow, __test__ } from '../../../src/components/ElementChatWindow';
import type { ElementDescriptor } from '../../../src/services/elementIdService';

const { formatStreamingChunk } = __test__;

const chatWithPageMock = vi.fn<
  (...args: any[]) => AsyncGenerator<string, void, unknown>
>();

vi.mock('../../../src/services/claudeAPIService', () => ({
  chatWithPage: chatWithPageMock,
}));

const addMessageToChatMock = vi.fn();
const createElementChatSessionMock = vi.fn(async () => ({
  id: 'session-1',
  messages: [],
  elementDescriptors: [],
  windowState: {},
}));

vi.mock('../../../src/services/elementChatService', () => ({
  addMessageToChat: addMessageToChatMock,
  createElementChatSession: createElementChatSessionMock,
}));

vi.mock('../../../src/services/elementChatIndicatorService', () => ({
  upsertIndicatorsForSession: vi.fn(),
  removeIndicatorsForChat: vi.fn(),
  hideIndicatorsForChat: vi.fn(),
  showIndicatorsForChat: vi.fn(),
  showPostChatIndicator: vi.fn(),
  removePostChatIndicator: vi.fn(),
}));

vi.mock('../../../src/shared/components/ImageUpload/ImageUploadZone', () => ({
  ImageUploadZone: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-rnd', () => ({
  Rnd: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const makeDescriptor = (): ElementDescriptor => ({
  chatId: 'chat-1',
  tagName: 'div',
  id: 'panel-target',
  classes: [],
  cssSelector: '#panel-target',
  xpath: "//*[@id='panel-target']",
  textPreview: 'Panel text',
  boundingRect: {
    top: 0,
    left: 0,
    width: 200,
    height: 80,
  },
});

const setupHostElement = () => {
  const host = document.createElement('div');
  host.id = 'panel-target';
  host.textContent = 'Panel text';
  host.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    width: 200,
    height: 80,
    bottom: 80,
    right: 200,
  } as DOMRect);
  document.body.appendChild(host);
  return host;
};

const baseProps = {
  elementId: 'element-chat-1',
  existingSession: null,
  onClose: vi.fn(),
  initialPosition: { x: 0, y: 0 },
};

let scrollIntoViewMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  chatWithPageMock.mockReset();
  addMessageToChatMock.mockReset();
  createElementChatSessionMock.mockClear();
  scrollIntoViewMock = vi.fn();
  (Element.prototype as any).scrollIntoView = scrollIntoViewMock;
});

afterEach(() => {
  document.body.innerHTML = '';
});

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

describe('ElementChatWindow auto-scroll behaviour', () => {
  it('smooth scrolls when user stays anchored at the bottom', async () => {
    const stream = async function* () {
      yield 'Hello from the assistant';
    };
    chatWithPageMock.mockImplementation(stream);

    setupHostElement();
    const descriptor = makeDescriptor();

    render(
      <ElementChatWindow
        {...baseProps}
        elementDescriptor={descriptor}
        elementDescriptors={[descriptor]}
        selectedText={undefined}
      />
    );

    const input = screen.getByPlaceholderText(/ask about this element/i);
    fireEvent.change(input, { target: { value: 'Explain this element' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(chatWithPageMock).toHaveBeenCalled());
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
  });

  it('does not auto-scroll when the user scrolls away from the bottom', async () => {
    const resolvers: Array<() => void> = [];
    chatWithPageMock.mockImplementation(async function* () {
      yield 'Streaming chunk';
      await new Promise<void>(resolve => resolvers.push(resolve));
      yield 'Final chunk';
    });

    setupHostElement();
    const descriptor = makeDescriptor();

    render(
      <ElementChatWindow
        {...baseProps}
        elementDescriptor={descriptor}
        elementDescriptors={[descriptor]}
        selectedText={undefined}
      />
    );

    const container = await screen.findByTestId('element-chat-messages');
    Object.defineProperty(container, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true, configurable: true });

    const input = screen.getByPlaceholderText(/ask about this element/i);
    fireEvent.change(input, { target: { value: 'Scroll test' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    fireEvent.scroll(container);
    scrollIntoViewMock.mockClear();

    await act(async () => {
      resolvers.shift()?.();
    });

    await waitFor(() => expect(chatWithPageMock).toHaveBeenCalled());
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
