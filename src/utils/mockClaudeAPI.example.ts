/**
 * Mock Claude API Usage Examples
 *
 * Demonstrates various ways to use the MockClaudeAPI for testing and development.
 */

import { MockClaudeAPI, mockClaudeAPI } from './mockClaudeAPI';
import type { ChatContext } from '@/types';

// ============================================================================
// Example 1: Simple Message
// ============================================================================

async function example1_simpleMessage() {
  console.log('=== Example 1: Simple Message ===');

  const response = await mockClaudeAPI.sendMessage('What is this button?');
  console.log('Response:', response);
  console.log();
}

// ============================================================================
// Example 2: Message with Context
// ============================================================================

async function example2_withContext() {
  console.log('=== Example 2: Message with Context ===');

  const context: ChatContext = {
    cardId: 'card-123',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'What is this?',
        timestamp: Date.now() - 5000,
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'This is a navigation button.',
        timestamp: Date.now() - 4000,
      },
    ],
    isStreaming: false,
    currentInput: '',
  };

  const response = await mockClaudeAPI.sendMessage('How do I style it?', context);
  console.log('Response:', response);
  console.log();
}

// ============================================================================
// Example 3: Streaming Response
// ============================================================================

async function example3_streaming() {
  console.log('=== Example 3: Streaming Response ===');

  let fullResponse = '';

  for await (const chunk of mockClaudeAPI.createStreamingResponse('Explain this in detail')) {
    if (chunk.type === 'content_block_delta' && chunk.delta) {
      process.stdout.write(chunk.delta.text);
      fullResponse += chunk.delta.text;
    } else if (chunk.type === 'message_stop') {
      console.log('\n[Stream ended]');
    }
  }

  console.log();
}

// ============================================================================
// Example 4: Custom Configuration
// ============================================================================

async function example4_customConfig() {
  console.log('=== Example 4: Custom Configuration ===');

  // Create instance with custom config
  const customAPI = new MockClaudeAPI({
    minDelay: 100,
    maxDelay: 300,
    chunkDelay: 20,
    enableThinking: false,
    seed: 42, // Deterministic responses
  });

  const response = await customAPI.sendMessage('Summarize this component');
  console.log('Response:', response);
  console.log();
}

// ============================================================================
// Example 5: Different Query Types
// ============================================================================

async function example5_differentQueries() {
  console.log('=== Example 5: Different Query Types ===');

  const queries = [
    'What is this?',
    'Summarize this element',
    'Explain how this works',
    'What are the accessibility features?',
    'How can I improve this?',
    'Compare this to similar elements',
  ];

  for (const query of queries) {
    console.log(`\nQuery: "${query}"`);
    const response = await mockClaudeAPI.sendMessage(query);
    console.log(`Response: ${response.substring(0, 150)}...`);
  }

  console.log();
}

// ============================================================================
// Example 6: Conversation History
// ============================================================================

async function example6_conversationHistory() {
  console.log('=== Example 6: Conversation History ===');

  const context: ChatContext = {
    cardId: 'card-456',
    messages: [],
    isStreaming: false,
    currentInput: '',
  };

  // First message
  const response1 = await mockClaudeAPI.sendMessage('What is this button?', context);
  console.log('User: What is this button?');
  console.log('Assistant:', response1.substring(0, 100) + '...\n');

  // Get history
  const history = mockClaudeAPI.getHistory('card-456');
  console.log(`History contains ${history.length} messages`);
  console.log();

  // Clear history
  mockClaudeAPI.clearHistory('card-456');
  console.log('History cleared');
  console.log();
}

// ============================================================================
// Example 7: API Request Format
// ============================================================================

async function example7_apiRequest() {
  console.log('=== Example 7: API Request Format ===');

  const response = await mockClaudeAPI.sendRequest({
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Analyze this code element',
        timestamp: Date.now(),
      },
    ],
    maxTokens: 1000,
    stream: false,
  });

  console.log('Response ID:', response.id);
  console.log('Role:', response.role);
  console.log('Content:', response.content.substring(0, 150) + '...');
  console.log('Stop Reason:', response.stopReason);
  console.log();
}

// ============================================================================
// Example 8: Deterministic Testing
// ============================================================================

async function example8_deterministicTesting() {
  console.log('=== Example 8: Deterministic Testing ===');

  // Create two instances with same seed
  const api1 = new MockClaudeAPI({ seed: 12345 });
  const api2 = new MockClaudeAPI({ seed: 12345 });

  const message = 'Explain this component';

  const response1 = await api1.sendMessage(message);
  const response2 = await api2.sendMessage(message);

  console.log('Response 1:', response1.substring(0, 100) + '...');
  console.log('Response 2:', response2.substring(0, 100) + '...');
  console.log('Responses match:', response1 === response2);
  console.log();
}

// ============================================================================
// Example 9: Performance Testing
// ============================================================================

async function example9_performance() {
  console.log('=== Example 9: Performance Testing ===');

  // Fast API for testing
  const fastAPI = new MockClaudeAPI({
    minDelay: 10,
    maxDelay: 50,
    chunkDelay: 5,
    enableThinking: false,
  });

  const startTime = Date.now();

  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(fastAPI.sendMessage(`Query ${i}`));
  }

  await Promise.all(promises);

  const duration = Date.now() - startTime;
  console.log(`Processed 10 messages in ${duration}ms`);
  console.log(`Average: ${duration / 10}ms per message`);
  console.log();
}

// ============================================================================
// Example 10: Streaming with Progress Tracking
// ============================================================================

async function example10_streamingProgress() {
  console.log('=== Example 10: Streaming with Progress Tracking ===');

  let chunkCount = 0;
  let wordCount = 0;
  let fullResponse = '';

  const startTime = Date.now();

  for await (const chunk of mockClaudeAPI.createStreamingResponse('Provide a detailed explanation')) {
    if (chunk.type === 'content_block_delta' && chunk.delta) {
      chunkCount++;
      wordCount += chunk.delta.text.trim().split(/\s+/).length;
      fullResponse += chunk.delta.text;
    } else if (chunk.type === 'message_stop') {
      const duration = Date.now() - startTime;
      console.log(`\n\n[Streaming complete]`);
      console.log(`Chunks received: ${chunkCount}`);
      console.log(`Words received: ${wordCount}`);
      console.log(`Duration: ${duration}ms`);
      console.log(`Average: ${duration / chunkCount}ms per chunk`);
    }
  }

  console.log();
}

// ============================================================================
// Run Examples
// ============================================================================

async function runAllExamples() {
  try {
    await example1_simpleMessage();
    await example2_withContext();
    await example3_streaming();
    await example4_customConfig();
    await example5_differentQueries();
    await example6_conversationHistory();
    await example7_apiRequest();
    await example8_deterministicTesting();
    await example9_performance();
    await example10_streamingProgress();

    console.log('=== All examples completed successfully ===');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllExamples();
}

// Export for use in other files
export {
  example1_simpleMessage,
  example2_withContext,
  example3_streaming,
  example4_customConfig,
  example5_differentQueries,
  example6_conversationHistory,
  example7_apiRequest,
  example8_deterministicTesting,
  example9_performance,
  example10_streamingProgress,
};
