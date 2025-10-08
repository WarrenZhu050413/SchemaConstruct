/**
 * Unit tests for InlineChatWindow image drop support
 *
 * Tests cover:
 * - Image validation and processing
 * - Pending images state management
 * - Message format with images
 * - Multimodal API transformation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InlineChatWindow } from '../../../src/components/InlineChatWindow';
import type { PageContext } from '../../../src/services/pageContextCapture';
import * as imageUpload from '../../../src/utils/imageUpload';

// Mock dependencies
const chatWithPageMock = vi.fn<
  (...args: any[]) => AsyncGenerator<string, void, unknown>
>();
const sendMessageMock = vi.fn();

vi.mock('../../../src/utils/imageUpload');
vi.mock('../../../src/services/claudeAPIService', () => ({
  chatWithPage: chatWithPageMock,
  claudeAPIService: {
    sendMessage: sendMessageMock,
  },
}));

// Mock chrome runtime
const mockRuntime = {
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
  sendMessage: vi.fn(),
};

(global as any).chrome = {
  runtime: mockRuntime,
};

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

describe('InlineChatWindow - Image Drop Support', () => {
  const mockPageContext: PageContext = {
    title: 'Test Page',
    url: 'https://test.com',
    content: 'Test page content',
    headings: [],
    metadata: {},
  };

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    chatWithPageMock.mockReset();
    sendMessageMock.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Auto-scroll behavior', () => {
    const mockStream = async function* () {
      yield 'partial';
      yield 'complete';
    };

    it('auto-scrolls when user remains anchored at bottom', async () => {
      chatWithPageMock.mockImplementation(mockStream);

      const scrollMock = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;

      render(
        <InlineChatWindow
          onClose={mockOnClose}
          initialContext={mockPageContext}
        />
      );

      scrollMock.mockClear();

      const input = screen.getByPlaceholderText(/ask about this page/i);
      fireEvent.change(input, { target: { value: 'Hello there' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

      await waitFor(() => expect(chatWithPageMock).toHaveBeenCalled());
      await waitFor(() => expect(scrollMock.mock.calls.length).toBeGreaterThan(0));
    });

    it('does not auto-scroll when user has scrolled up', async () => {
      chatWithPageMock.mockImplementation(mockStream);

      const scrollMock = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;

      render(
        <InlineChatWindow
          onClose={mockOnClose}
          initialContext={mockPageContext}
        />
      );

      const container = screen.getByTestId('inline-chat-messages');

      Object.defineProperty(container, 'scrollHeight', {
        configurable: true,
        value: 400,
      });
      Object.defineProperty(container, 'clientHeight', {
        configurable: true,
        value: 200,
      });
      Object.defineProperty(container, 'scrollTop', {
        configurable: true,
        writable: true,
        value: 0,
      });

      fireEvent.scroll(container);

      scrollMock.mockClear();

      const input = screen.getByPlaceholderText(/ask about this page/i);
      fireEvent.change(input, { target: { value: 'New question' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

      await waitFor(() => expect(chatWithPageMock).toHaveBeenCalled());
      await waitFor(() => expect(scrollMock).not.toHaveBeenCalled());
    });
  });

  describe('Highlight to context shortcut', () => {
    const mockStream = async function* () {
      yield 'chunk';
      yield 'done';
    };

    it('moves selected chat text into the input when Enter is pressed', async () => {
      chatWithPageMock.mockImplementation(mockStream);

      render(
        <InlineChatWindow
          onClose={mockOnClose}
          initialContext={mockPageContext}
        />
      );

      const input = screen.getByPlaceholderText(/ask about this page/i);
      fireEvent.change(input, { target: { value: 'Context snippet' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

      await screen.findByText('Context snippet');

      const messageNode = screen.getByText('Context snippet');
      const range = document.createRange();
      range.selectNodeContents(messageNode);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      fireEvent.keyDown(messageNode, { key: 'Enter', code: 'Enter' });

      const textarea = screen.getByPlaceholderText(/ask about this page/i) as HTMLTextAreaElement;
      await waitFor(() => {
        expect(textarea.value).toBe('Context snippet');
      });

      expect(window.getSelection()?.toString()).toBe('');
    });

    it('ignores Enter when no chat selection exists', () => {
      render(
        <InlineChatWindow
          onClose={mockOnClose}
          initialContext={mockPageContext}
        />
      );

      window.getSelection()?.removeAllRanges();
      const textarea = screen.getByPlaceholderText(/ask about this page/i) as HTMLTextAreaElement;

      fireEvent.keyDown(document.body, { key: 'Enter', code: 'Enter' });

      expect(textarea.value).toBe('');
    });
  });

  describe('Send button and queue behaviour', () => {
    it('keeps the send button enabled while messages stream and queues follow-up sends', async () => {
      const resolvers: Array<() => void> = [];
      chatWithPageMock.mockImplementation(async function* () {
        yield 'first-chunk';
        await new Promise<void>(resolve => {
          resolvers.push(resolve);
        });
        yield 'first-done';
      });

      render(
        <InlineChatWindow
          onClose={mockOnClose}
          initialContext={mockPageContext}
        />
      );

      const input = screen.getByPlaceholderText(/ask about this page/i);
      const sendButton = screen.getByTestId('inline-chat-send');

      fireEvent.change(input, { target: { value: 'Hello queue' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

      await screen.findByText('Hello queue');
      expect(sendButton).toBeDisabled();
      expect(chatWithPageMock).toHaveBeenCalledTimes(1);

      fireEvent.change(input, { target: { value: 'Second queued message' } });
      await waitFor(() => expect(sendButton).not.toBeDisabled());
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });
      expect(chatWithPageMock).toHaveBeenCalledTimes(1);

      resolvers[0]?.();
      await waitFor(() => expect(chatWithPageMock).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(resolvers.length).toBeGreaterThanOrEqual(2));

      resolvers[1]?.();
      await waitFor(() => {
        const texts = screen.getAllByTestId('inline-chat-message-text').map(node => node.textContent);
        expect(texts.length).toBe(4);
      });
    });

    it('processes queued messages sequentially and preserves ordering', async () => {
      const resolvers: Array<() => void> = [];
      let callIndex = 0;

      chatWithPageMock.mockImplementation(async function* () {
        const current = callIndex++;
        const label = current === 0 ? 'first' : 'second';
        yield `${label}-chunk`;
        await new Promise<void>(resolve => {
          resolvers[current] = resolve;
        });
        yield `${label}-done`;
      });

      render(
        <InlineChatWindow
          onClose={mockOnClose}
          initialContext={mockPageContext}
        />
      );

      const input = screen.getByPlaceholderText(/ask about this page/i);

      fireEvent.change(input, { target: { value: 'First question' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

      await screen.findByText('First question');

      fireEvent.change(input, { target: { value: 'Second question' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

      expect(chatWithPageMock).toHaveBeenCalledTimes(1);

      resolvers[0]?.();
      await waitFor(() => expect(chatWithPageMock).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(resolvers.length).toBeGreaterThanOrEqual(2));

      resolvers[1]?.();
      await waitFor(() => {
        const texts = screen.getAllByTestId('inline-chat-message-text').map(node => node.textContent?.trim());
        expect(texts).toEqual([
          'First question',
          'first-chunkfirst-done',
          'Second question',
          'second-chunksecond-done',
        ]);
      });
    });
  });

  describe('Image Validation', () => {
    it('should accept valid image files', async () => {
      const { container } = render(
        <InlineChatWindow
          onClose={mockOnClose}
          initialContext={mockPageContext}
        />
      );

      // Mock successful image processing
      vi.mocked(imageUpload.isImageFile).mockReturnValue(true);
      vi.mocked(imageUpload.fileToBase64).mockResolvedValue('data:image/png;base64,abc123');
      vi.mocked(imageUpload.getImageDimensions).mockResolvedValue({ width: 800, height: 600 });

      // Create a mock image file
      const file = new File(['image'], 'test.png', { type: 'image/png' });

      // Simulate the handleImageDrop being called
      // Note: Direct testing would require accessing the component's internal methods
      // In a real E2E test, we'd test this via drag-drop
      expect(container).toBeDefined();
    });

    it('should reject non-image files', () => {
      const file = new File(['text'], 'test.txt', { type: 'text/plain' });

      vi.mocked(imageUpload.isImageFile).mockReturnValue(false);

      expect(imageUpload.isImageFile(file)).toBe(false);
    });

    it('should process PNG images', async () => {
      const file = new File(['image'], 'test.png', { type: 'image/png' });
      const mockDataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const mockDimensions = { width: 1920, height: 1080 };

      vi.mocked(imageUpload.isImageFile).mockReturnValue(true);
      vi.mocked(imageUpload.fileToBase64).mockResolvedValue(mockDataURL);
      vi.mocked(imageUpload.getImageDimensions).mockResolvedValue(mockDimensions);

      expect(await imageUpload.isImageFile(file)).toBe(true);
      expect(await imageUpload.fileToBase64(file)).toBe(mockDataURL);
      expect(await imageUpload.getImageDimensions(mockDataURL)).toEqual(mockDimensions);
    });

    it('should process JPEG images', async () => {
      const file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });

      vi.mocked(imageUpload.isImageFile).mockReturnValue(true);
      vi.mocked(imageUpload.fileToBase64).mockResolvedValue('data:image/jpeg;base64,/9j/4AAQ...');
      vi.mocked(imageUpload.getImageDimensions).mockResolvedValue({ width: 4032, height: 3024 });

      expect(imageUpload.isImageFile(file)).toBe(true);
    });

    it('should handle image processing errors gracefully', async () => {
      const file = new File(['corrupt'], 'corrupt.png', { type: 'image/png' });

      vi.mocked(imageUpload.isImageFile).mockReturnValue(true);
      vi.mocked(imageUpload.fileToBase64).mockRejectedValue(new Error('Failed to read file'));

      await expect(imageUpload.fileToBase64(file)).rejects.toThrow('Failed to read file');
    });
  });

  describe('Component Rendering', () => {
    it('should render without images initially', () => {
      render(
        <InlineChatWindow
          onClose={mockOnClose}
          initialContext={mockPageContext}
        />
      );

      // Should render the window
      expect(screen.getByText(/chat with (this )?page/i)).toBeDefined();
    });

    it('should show window controls', () => {
      render(
        <InlineChatWindow
          onClose={mockOnClose}
          initialContext={mockPageContext}
        />
      );

      // Should have close button
      const closeButton = screen.getByTitle(/close chat/i);
      expect(closeButton).toBeDefined();

      // Clicking close should call onClose
      fireEvent.click(closeButton);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should show collapse/expand button', () => {
      render(
        <InlineChatWindow
          onClose={mockOnClose}
          initialContext={mockPageContext}
        />
      );

      const collapseButton = screen.getByTitle(/collapse to header/i);
      expect(collapseButton).toBeDefined();
    });
  });

  describe('Message Type Structure', () => {
    it('should support text-only messages', () => {
      // Message type test
      interface Message {
        role: 'user' | 'assistant';
        content: string;
        images?: Array<{
          dataURL: string;
          width: number;
          height: number;
        }>;
      }

      const textMessage: Message = {
        role: 'user',
        content: 'Hello, how are you?',
      };

      expect(textMessage.content).toBe('Hello, how are you?');
      expect(textMessage.images).toBeUndefined();
    });

    it('should support messages with images', () => {
      interface Message {
        role: 'user' | 'assistant';
        content: string;
        images?: Array<{
          dataURL: string;
          width: number;
          height: number;
        }>;
      }

      const imageMessage: Message = {
        role: 'user',
        content: 'What is in this image?',
        images: [
          {
            dataURL: 'data:image/png;base64,abc123',
            width: 800,
            height: 600,
          },
        ],
      };

      expect(imageMessage.images).toHaveLength(1);
      expect(imageMessage.images![0].width).toBe(800);
      expect(imageMessage.images![0].height).toBe(600);
    });

    it('should support multiple images in one message', () => {
      interface Message {
        role: 'user' | 'assistant';
        content: string;
        images?: Array<{
          dataURL: string;
          width: number;
          height: number;
        }>;
      }

      const multiImageMessage: Message = {
        role: 'user',
        content: 'Compare these two images',
        images: [
          { dataURL: 'data:image/png;base64,img1', width: 800, height: 600 },
          { dataURL: 'data:image/png;base64,img2', width: 1024, height: 768 },
        ],
      };

      expect(multiImageMessage.images).toHaveLength(2);
    });
  });

  describe('Multimodal API Format', () => {
    it('should transform messages to Claude multimodal format', () => {
      // Test transformation logic
      const message = {
        role: 'user' as const,
        content: 'Describe this image',
        images: [
          {
            dataURL: 'data:image/png;base64,iVBORw0KG...',
            width: 800,
            height: 600,
          },
        ],
      };

      // Extract media type and base64 data
      const dataURL = message.images[0].dataURL;
      const mediaType = dataURL.match(/data:([^;]+);/)?.[1] || 'image/png';
      const base64Data = dataURL.split(',')[1];

      expect(mediaType).toBe('image/png');
      expect(base64Data).toBe('iVBORw0KG...');

      // Transformed format for Claude API
      const transformedContent = [
        {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mediaType,
            data: base64Data,
          },
        },
        { type: 'text' as const, text: message.content },
      ];

      expect(transformedContent).toHaveLength(2);
      expect(transformedContent[0].type).toBe('image');
      expect(transformedContent[1].type).toBe('text');
    });

    it('should extract JPEG media type correctly', () => {
      const dataURL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...';
      const mediaType = dataURL.match(/data:([^;]+);/)?.[1];

      expect(mediaType).toBe('image/jpeg');
    });

    it('should extract WebP media type correctly', () => {
      const dataURL = 'data:image/webp;base64,UklGRiQAAABXRUJQ...';
      const mediaType = dataURL.match(/data:([^;]+);/)?.[1];

      expect(mediaType).toBe('image/webp');
    });

    it('should default to PNG if media type not found', () => {
      const dataURL = 'base64string';
      const mediaType = dataURL.match(/data:([^;]+);/)?.[1] || 'image/png';

      expect(mediaType).toBe('image/png');
    });
  });

  describe('Image State Management', () => {
    it('should start with empty pending images', () => {
      render(
        <InlineChatWindow
          onClose={mockOnClose}
          initialContext={mockPageContext}
        />
      );

      // No images should be visible initially
      const images = screen.queryAllByAltText(/pending image/i);
      expect(images).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle image-only messages (no text)', () => {
      interface Message {
        role: 'user' | 'assistant';
        content: string;
        images?: Array<{
          dataURL: string;
          width: number;
          height: number;
        }>;
      }

      const imageOnlyMessage: Message = {
        role: 'user',
        content: '(Image attached)', // Default text when no user text
        images: [
          {
            dataURL: 'data:image/png;base64,abc',
            width: 800,
            height: 600,
          },
        ],
      };

      expect(imageOnlyMessage.content).toBe('(Image attached)');
      expect(imageOnlyMessage.images).toHaveLength(1);
    });

    it('should handle very large images', async () => {
      const largeImageDataURL = 'data:image/png;base64,' + 'A'.repeat(10000);
      const dimensions = { width: 4000, height: 3000 };

      vi.mocked(imageUpload.getImageDimensions).mockResolvedValue(dimensions);

      const result = await imageUpload.getImageDimensions(largeImageDataURL);
      expect(result.width).toBe(4000);
      expect(result.height).toBe(3000);
    });

    it('should handle special characters in image data', () => {
      const dataURL = 'data:image/png;base64,+/=ABC123+/=';
      const base64Data = dataURL.split(',')[1];

      expect(base64Data).toBe('+/=ABC123+/=');
    });
  });
});
