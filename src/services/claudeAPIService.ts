/**
 * Claude API Service
 * Real integration with Anthropic Claude API for Chrome extension
 */

import { apiConfigService } from './apiConfig';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; [key: string]: any }>;
}

export interface ClaudeAPIRequest {
  model?: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
  temperature?: number;
  system?: string;
}

export interface ClaudeAPIResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text?: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Claude API Service
 * Handles communication with Anthropic's Claude API
 *
 * Priority order:
 * 1. Local backend (Agent SDK with subscription auth)
 * 2. Direct API (requires API key)
 * 3. Caller falls back to mock
 */
export class ClaudeAPIService {
  private readonly API_VERSION = '2023-06-01';
  private readonly API_URL = 'https://api.anthropic.com/v1/messages';
  private readonly BACKEND_URL = 'http://localhost:3100';
  private readonly DEFAULT_MODEL = 'claude-sonnet-4-20250514';
  private readonly DEFAULT_MAX_TOKENS = 4096;

  /**
   * Send a message to Claude API
   * Tries local backend first, then falls back to direct API
   */
  async sendMessage(
    messages: ClaudeMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      system?: string;
    }
  ): Promise<string> {
    // STEP 1: Try local backend (Agent SDK with subscription auth)
    try {
      console.log('[ClaudeAPI] Trying local backend first...');
      const backendResponse = await fetch(`${this.BACKEND_URL}/api/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          options: {
            system: options?.system,
            maxTokens: options?.maxTokens || this.DEFAULT_MAX_TOKENS,
            temperature: options?.temperature,
            model: options?.model || this.DEFAULT_MODEL,
          },
        }),
      });

      if (backendResponse.ok) {
        const data = await backendResponse.json();
        if (data.content) {
          console.log('[ClaudeAPI] ✓ Backend success (subscription auth)');
          return data.content;
        }
      } else if (backendResponse.status === 501) {
        // Backend doesn't support multimodal - fallback to direct API
        const data = await backendResponse.json().catch(() => ({}));
        console.log('[ClaudeAPI] Backend returned 501 (multimodal not supported), using direct API:', data.error);
      } else {
        console.log('[ClaudeAPI] Backend returned status', backendResponse.status, '- trying direct API...');
      }
    } catch (backendError) {
      console.log('[ClaudeAPI] Backend not running, trying direct API...');
    }

    // STEP 2: Try direct API with API key
    const apiKey = await apiConfigService.getAPIKey();

    const request: ClaudeAPIRequest = {
      model: options?.model || this.DEFAULT_MODEL,
      messages,
      max_tokens: options?.maxTokens || this.DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? 1.0,
    };

    if (options?.system) {
      request.system = options.system;
    }

    // Log multimodal message details
    const hasMultimodal = messages.some(m => Array.isArray(m.content));
    if (hasMultimodal) {
      console.log('[ClaudeAPI] Multimodal message detected');
      const multimodalMsg = messages.find(m => Array.isArray(m.content));
      if (multimodalMsg && Array.isArray(multimodalMsg.content)) {
        const imageBlocks = multimodalMsg.content.filter(b => b.type === 'image');
        console.log('[ClaudeAPI] Image blocks:', imageBlocks.length);
        console.log('[ClaudeAPI] Sample image block:', imageBlocks[0]);
      }
    }

    console.log('[ClaudeAPI] Trying direct API:', {
      model: request.model,
      messageCount: messages.length,
      hasSystem: !!request.system,
      hasAPIKey: !!apiKey,
      hasMultimodal,
    });

    try {
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
          'anthropic-version': this.API_VERSION,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[ClaudeAPI] Direct API error:', errorData);
        throw new Error(
          `Claude API error: ${response.status} ${response.statusText}${
            errorData.error?.message ? ` - ${errorData.error.message}` : ''
          }`
        );
      }

      const data: ClaudeAPIResponse = await response.json();
      console.log('[ClaudeAPI] ✓ Direct API success:', {
        id: data.id,
        stopReason: data.stop_reason,
        usage: data.usage,
      });

      // Extract text from response
      const textContent = data.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return textContent;
    } catch (error) {
      console.error('[ClaudeAPI] Error calling Claude API:', error);
      throw error;
    }
  }

  /**
   * Send a message with vision (screenshot analysis)
   * For beautification "recreate-design" mode
   *
   * Note: Vision API requires direct API with API key
   * Backend doesn't support vision yet
   */
  async sendMessageWithVision(
    messages: ClaudeMessage[],
    screenshotBase64: string,
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      system?: string;
    }
  ): Promise<string> {
    // Vision API requires direct API (backend doesn't support vision yet)
    console.log('[ClaudeAPI] Vision requires direct API');

    const apiKey = await apiConfigService.getAPIKey();

    // Use vision-capable model
    const model = 'claude-sonnet-4-20250514'; // Sonnet 4 supports vision

    // Add screenshot to the last user message
    const enhancedMessages = [...messages];
    const lastMessage = enhancedMessages[enhancedMessages.length - 1];

    if (lastMessage && lastMessage.role === 'user') {
      // Convert content to multimodal format
      const originalContent = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : '';

      lastMessage.content = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: screenshotBase64,
          },
        },
        {
          type: 'text',
          text: originalContent,
        },
      ];
    }

    const request: ClaudeAPIRequest = {
      model,
      messages: enhancedMessages,
      max_tokens: options?.maxTokens || this.DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? 1.0,
    };

    if (options?.system) {
      request.system = options.system;
    }

    console.log('[ClaudeAPI] Sending vision request to direct API:', {
      model: request.model,
      messageCount: enhancedMessages.length,
      hasScreenshot: true,
      hasAPIKey: !!apiKey,
    });

    try {
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
          'anthropic-version': this.API_VERSION,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[ClaudeAPI] Vision API error:', errorData);
        throw new Error(
          `Claude API error: ${response.status} ${response.statusText}${
            errorData.error?.message ? ` - ${errorData.error.message}` : ''
          }`
        );
      }

      const data: ClaudeAPIResponse = await response.json();
      console.log('[ClaudeAPI] ✓ Vision API success:', {
        id: data.id,
        stopReason: data.stop_reason,
        usage: data.usage,
      });

      // Extract text from response
      const textContent = data.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return textContent;
    } catch (error) {
      console.error('[ClaudeAPI] Error calling Claude Vision API:', error);
      throw error;
    }
  }

  /**
   * Send a message with streaming response
   * Returns an async generator that yields text chunks
   */
  async *sendMessageStreaming(
    messages: ClaudeMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      system?: string;
    }
  ): AsyncGenerator<string, void, unknown> {
    // STEP 1: Try local backend first
    try {
      console.log('[ClaudeAPI] Trying streaming via local backend...');
      const backendResponse = await fetch(`${this.BACKEND_URL}/api/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          options: {
            system: options?.system,
            maxTokens: options?.maxTokens || this.DEFAULT_MAX_TOKENS,
            temperature: options?.temperature,
            model: options?.model || this.DEFAULT_MODEL,
          },
        }),
      });

      if (backendResponse.ok && backendResponse.body) {
        console.log('[ClaudeAPI] ✓ Streaming via backend (subscription auth)');
        const reader = backendResponse.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.delta?.text) {
                  yield parsed.delta.text;
                }
              } catch (e) {
                console.warn('[ClaudeAPI] Failed to parse SSE data:', data);
              }
            }
          }
        }
        return;
      }

      console.log('[ClaudeAPI] Backend streaming unavailable, trying direct API...');
    } catch (backendError) {
      console.log('[ClaudeAPI] Backend not running, trying direct API...');
    }

    // STEP 2: Try direct API with streaming
    const apiKey = await apiConfigService.getAPIKey();

    const request = {
      model: options?.model || this.DEFAULT_MODEL,
      messages,
      max_tokens: options?.maxTokens || this.DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? 1.0,
      stream: true,
      ...(options?.system ? { system: options.system } : {}),
    };

    console.log('[ClaudeAPI] Trying direct API streaming:', {
      model: request.model,
      messageCount: messages.length,
      hasSystem: !!request.system,
      hasAPIKey: !!apiKey,
    });

    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
        'anthropic-version': this.API_VERSION,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[ClaudeAPI] Direct API streaming error:', errorData);
      throw new Error(
        `Claude API error: ${response.status} ${response.statusText}${
          errorData.error?.message ? ` - ${errorData.error.message}` : ''
        }`
      );
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    console.log('[ClaudeAPI] ✓ Direct API streaming started');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text;
            }
          } catch (e) {
            console.warn('[ClaudeAPI] Failed to parse SSE data:', data);
          }
        }
      }
    }
  }

  /**
   * Check if API is configured and accessible
   */
  async testConnection(): Promise<boolean> {
    try {
      const hasKey = await apiConfigService.hasAPIKey();
      if (!hasKey) {
        return false;
      }

      // Try a simple API call
      await this.sendMessage(
        [{ role: 'user', content: 'Hello' }],
        { maxTokens: 10 }
      );

      return true;
    } catch (error) {
      console.error('[ClaudeAPI] Connection test failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const claudeAPIService = new ClaudeAPIService();

/**
 * Chat with a web page using streaming API
 * Convenience function for inline chat feature
 */
export async function* chatWithPage(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): AsyncGenerator<string, void, unknown> {
  const testStreamConfig = typeof window !== 'undefined'
    ? (window as any).__NABOKOV_TEST_STREAM__
    : undefined;

  if (testStreamConfig && Array.isArray(testStreamConfig.chunks)) {
    for (const chunk of testStreamConfig.chunks) {
      yield chunk;
      if (typeof testStreamConfig.delay === 'number' && testStreamConfig.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, testStreamConfig.delay));
      }
    }

    if (!testStreamConfig.persist && typeof window !== 'undefined') {
      delete (window as any).__NABOKOV_TEST_STREAM__;
    }
    return;
  }

  const claudeMessages: ClaudeMessage[] = messages.map(m => ({
    role: m.role,
    content: m.content
  }));

  yield* claudeAPIService.sendMessageStreaming(claudeMessages, {
    system: systemPrompt,
    maxTokens: 4096,
    temperature: 0.7
  });
}
