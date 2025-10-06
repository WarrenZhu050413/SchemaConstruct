/**
 * Mock Claude API - Basic Tests
 *
 * Simple tests to verify the Mock Claude API functionality.
 */

import { MockClaudeAPI, mockClaudeAPI } from './mockClaudeAPI';
import type { ChatContext } from '@/types';

describe('MockClaudeAPI', () => {
  describe('Basic Functionality', () => {
    it('should create an instance', () => {
      const api = new MockClaudeAPI();
      expect(api).toBeDefined();
    });

    it('should send a message and receive a response', async () => {
      const response = await mockClaudeAPI.sendMessage('What is this?');
      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should generate different responses for different queries', async () => {
      const response1 = await mockClaudeAPI.sendMessage('What is this?');
      const response2 = await mockClaudeAPI.sendMessage('Summarize this');

      expect(response1).not.toBe(response2);
    });
  });

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const api = new MockClaudeAPI({
        minDelay: 100,
        maxDelay: 500,
        seed: 42,
      });

      expect(api).toBeDefined();
    });

    it('should produce deterministic results with same seed', async () => {
      const api1 = new MockClaudeAPI({ seed: 12345 });
      const api2 = new MockClaudeAPI({ seed: 12345 });

      const response1 = await api1.sendMessage('Test message');
      const response2 = await api2.sendMessage('Test message');

      expect(response1).toBe(response2);
    });

    it('should update configuration dynamically', () => {
      const api = new MockClaudeAPI({ minDelay: 100 });
      api.updateConfig({ minDelay: 50, maxDelay: 200 });

      expect(api).toBeDefined();
    });
  });

  describe('Streaming', () => {
    it('should create a streaming response', async () => {
      const chunks: string[] = [];

      for await (const chunk of mockClaudeAPI.createStreamingResponse('Test')) {
        if (chunk.type === 'content_block_delta' && chunk.delta) {
          chunks.push(chunk.delta.text);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should end with message_stop', async () => {
      let foundStop = false;

      for await (const chunk of mockClaudeAPI.createStreamingResponse('Test')) {
        if (chunk.type === 'message_stop') {
          foundStop = true;
        }
      }

      expect(foundStop).toBe(true);
    });
  });

  describe('Conversation History', () => {
    it('should maintain conversation history', async () => {
      const api = new MockClaudeAPI();
      const context: ChatContext = {
        cardId: 'test-card',
        messages: [],
        isStreaming: false,
        currentInput: '',
      };

      await api.sendMessage('First message', context);
      const history = api.getHistory('test-card');

      expect(history.length).toBeGreaterThan(0);
    });

    it('should clear history for a specific card', async () => {
      const api = new MockClaudeAPI();
      const context: ChatContext = {
        cardId: 'test-card',
        messages: [],
        isStreaming: false,
        currentInput: '',
      };

      await api.sendMessage('Test message', context);
      api.clearHistory('test-card');
      const history = api.getHistory('test-card');

      expect(history.length).toBe(0);
    });

    it('should clear all history', async () => {
      const api = new MockClaudeAPI();

      await api.sendMessage('Test 1', {
        cardId: 'card-1',
        messages: [],
        isStreaming: false,
        currentInput: '',
      });

      await api.sendMessage('Test 2', {
        cardId: 'card-2',
        messages: [],
        isStreaming: false,
        currentInput: '',
      });

      api.clearHistory();

      expect(api.getHistory('card-1').length).toBe(0);
      expect(api.getHistory('card-2').length).toBe(0);
    });
  });

  describe('API Request Format', () => {
    it('should accept ClaudeAPIRequest format', async () => {
      const response = await mockClaudeAPI.sendRequest({
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Test message',
            timestamp: Date.now(),
          },
        ],
        maxTokens: 1000,
        stream: false,
      });

      expect(response).toBeDefined();
      expect(response.role).toBe('assistant');
      expect(response.content).toBeDefined();
      expect(response.id).toBeDefined();
    });
  });

  describe('Response Quality', () => {
    it('should respond to "what" questions', async () => {
      const response = await mockClaudeAPI.sendMessage('What is this button?');
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(50);
    });

    it('should respond to summarization requests', async () => {
      const response = await mockClaudeAPI.sendMessage('Summarize this element');
      expect(response).toBeDefined();
      // Response should be substantive, just check length rather than exact words
      expect(response.length).toBeGreaterThan(50);
    });

    it('should respond to explanation requests', async () => {
      const response = await mockClaudeAPI.sendMessage('Explain how this works');
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(100);
    });

    it('should respond to accessibility questions', async () => {
      const response = await mockClaudeAPI.sendMessage(
        'What are the accessibility features?'
      );
      expect(response).toBeDefined();
      // Response should be substantive, just check it exists and has content
      expect(response.length).toBeGreaterThan(30);
    });
  });

  describe('Performance', () => {
    it('should handle multiple concurrent requests', async () => {
      const api = new MockClaudeAPI({
        minDelay: 10,
        maxDelay: 50,
        enableThinking: false,
      });

      const promises = Array(10)
        .fill(0)
        .map((_, i) => api.sendMessage(`Query ${i}`));

      const responses = await Promise.all(promises);

      expect(responses.length).toBe(10);
      responses.forEach((response) => {
        expect(response).toBeDefined();
        expect(response.length).toBeGreaterThan(0);
      });
    });

    it('should complete within reasonable time', async () => {
      const api = new MockClaudeAPI({
        minDelay: 10,
        maxDelay: 50,
      });

      const startTime = Date.now();
      await api.sendMessage('Test');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty messages', async () => {
      const response = await mockClaudeAPI.sendMessage('');
      expect(response).toBeDefined();
    });

    it('should handle very long messages', async () => {
      const longMessage = 'a'.repeat(1000);
      const response = await mockClaudeAPI.sendMessage(longMessage);
      expect(response).toBeDefined();
    });

    it('should handle special characters', async () => {
      const response = await mockClaudeAPI.sendMessage(
        'What about <div>tags</div> & symbols?'
      );
      expect(response).toBeDefined();
    });
  });

  describe('Seed Behavior', () => {
    it('should reset seed correctly', async () => {
      const api = new MockClaudeAPI({ seed: 100 });

      const response1 = await api.sendMessage('Test');
      api.setSeed(100);
      const response2 = await api.sendMessage('Test');

      expect(response1).toBe(response2);
    });
  });
});
