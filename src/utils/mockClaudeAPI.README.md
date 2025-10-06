# Mock Claude API

A comprehensive, realistic simulation of the Claude API for testing and development purposes without making actual API calls.

## Features

- **Deterministic Responses**: Seed-based random generation for reproducible tests
- **Streaming Support**: Real-time response streaming with configurable delays
- **Context Awareness**: Analyzes message keywords to provide relevant responses
- **Natural Variations**: Multiple response templates for realistic conversation flow
- **Conversation History**: Tracks and maintains conversation state per card
- **Performance Tuning**: Configurable delays for different testing scenarios

## Installation

The Mock Claude API is located at `src/utils/mockClaudeAPI.ts` and can be imported directly:

```typescript
import { mockClaudeAPI, MockClaudeAPI } from './utils/mockClaudeAPI';
```

## Quick Start

### Simple Usage with Singleton

```typescript
import { mockClaudeAPI } from './utils/mockClaudeAPI';

// Send a message
const response = await mockClaudeAPI.sendMessage('What is this button?');
console.log(response);
```

### Streaming Response

```typescript
for await (const chunk of mockClaudeAPI.createStreamingResponse('Explain this')) {
  if (chunk.type === 'content_block_delta' && chunk.delta) {
    process.stdout.write(chunk.delta.text);
  }
}
```

### With Conversation Context

```typescript
const context: ChatContext = {
  cardId: 'card-123',
  messages: [...],
  isStreaming: false,
  currentInput: '',
};

const response = await mockClaudeAPI.sendMessage('How does this work?', context);
```

## API Reference

### Class: `MockClaudeAPI`

The main class for the Mock Claude API.

#### Constructor

```typescript
new MockClaudeAPI(config?: Partial<MockAPIConfig>)
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `minDelay` | number | 500 | Minimum response delay in ms |
| `maxDelay` | number | 2000 | Maximum response delay in ms |
| `chunkDelay` | number | 50 | Delay between streaming chunks in ms |
| `enableThinking` | boolean | true | Show "thinking" indicator occasionally |
| `seed` | number | Date.now() | Seed for deterministic random generation |

**Example:**

```typescript
const api = new MockClaudeAPI({
  minDelay: 100,
  maxDelay: 500,
  seed: 12345,
});
```

#### Methods

##### `sendMessage(message: string, context?: ChatContext): Promise<string>`

Sends a message and returns a complete response.

**Parameters:**
- `message`: The user's message
- `context`: Optional chat context with conversation history

**Returns:** Promise resolving to the assistant's response string

**Example:**
```typescript
const response = await api.sendMessage("What is this?", context);
```

##### `createStreamingResponse(message: string, context?: ChatContext): AsyncGenerator<ClaudeAPIStreamChunk>`

Creates a streaming response generator that yields chunks.

**Parameters:**
- `message`: The user's message
- `context`: Optional chat context

**Yields:** Stream chunks following the `ClaudeAPIStreamChunk` format

**Example:**
```typescript
for await (const chunk of api.createStreamingResponse("Explain this")) {
  if (chunk.type === 'content_block_delta' && chunk.delta) {
    console.log(chunk.delta.text);
  }
}
```

##### `sendRequest(request: ClaudeAPIRequest): Promise<ClaudeAPIResponse>`

Sends a message using the ClaudeAPIRequest format.

**Parameters:**
- `request`: Formatted API request

**Returns:** Promise resolving to `ClaudeAPIResponse`

**Example:**
```typescript
const response = await api.sendRequest({
  messages: [...],
  maxTokens: 1000,
  stream: false
});
```

##### `clearHistory(cardId?: string): void`

Clears conversation history for a specific card or all cards.

**Parameters:**
- `cardId`: Optional card ID. If not provided, clears all history.

**Example:**
```typescript
api.clearHistory('card-123'); // Clear specific card
api.clearHistory(); // Clear all
```

##### `getHistory(cardId: string): Message[]`

Gets conversation history for a specific card.

**Parameters:**
- `cardId`: Card ID to retrieve history for

**Returns:** Array of messages or empty array if not found

**Example:**
```typescript
const history = api.getHistory('card-123');
```

##### `updateConfig(config: Partial<MockAPIConfig>): void`

Updates the configuration.

**Parameters:**
- `config`: Partial configuration to merge with existing config

**Example:**
```typescript
api.updateConfig({ minDelay: 100, maxDelay: 300 });
```

##### `setSeed(seed: number): void`

Resets the random seed for deterministic testing.

**Parameters:**
- `seed`: New seed value

**Example:**
```typescript
api.setSeed(42);
```

## Response Generation

The Mock API analyzes message keywords and generates contextually relevant responses about web elements.

### Supported Query Types

| Query Type | Keywords | Example |
|------------|----------|---------|
| Identification | what, is, this, element | "What is this button?" |
| Summarization | summarize, summary, brief | "Summarize this component" |
| Explanation | explain, detail, how, why | "Explain how this works" |
| Style Analysis | style, design, css, appearance | "What styles are used?" |
| Purpose | purpose, function, use | "What is this for?" |
| Interaction | interact, click, hover | "How do users interact with this?" |
| Code | code, html, implementation | "How is this built?" |
| Comparison | compare, similar, alternative | "Compare this to similar elements" |
| Accessibility | accessibility, a11y, aria | "Is this accessible?" |
| Performance | performance, optimize, speed | "How can I optimize this?" |
| Content | content, text, information | "What content does this contain?" |
| Improvement | improve, enhance, better | "How can I improve this?" |

### Response Templates

The API uses multiple response templates for each query type, providing natural variation. Responses include:

- Element type identification
- Purpose and function description
- Implementation details
- Design considerations
- User interaction patterns
- Accessibility features
- Performance characteristics

## Testing Strategies

### Unit Testing

```typescript
describe('MockClaudeAPI', () => {
  it('should return deterministic responses with same seed', async () => {
    const api1 = new MockClaudeAPI({ seed: 42 });
    const api2 = new MockClaudeAPI({ seed: 42 });

    const response1 = await api1.sendMessage('What is this?');
    const response2 = await api2.sendMessage('What is this?');

    expect(response1).toBe(response2);
  });
});
```

### Integration Testing

```typescript
describe('Conversation flow', () => {
  it('should maintain conversation history', async () => {
    const api = new MockClaudeAPI();
    const context: ChatContext = {
      cardId: 'test-card',
      messages: [],
      isStreaming: false,
      currentInput: '',
    };

    await api.sendMessage('First question', context);
    const history = api.getHistory('test-card');

    expect(history).toHaveLength(1);
  });
});
```

### Performance Testing

```typescript
describe('Performance', () => {
  it('should handle multiple concurrent requests', async () => {
    const api = new MockClaudeAPI({ minDelay: 10, maxDelay: 50 });

    const promises = Array(100).fill(0).map((_, i) =>
      api.sendMessage(`Query ${i}`)
    );

    await expect(Promise.all(promises)).resolves.toHaveLength(100);
  });
});
```

## Advanced Usage

### Custom Response Pipeline

```typescript
class CustomMockAPI extends MockClaudeAPI {
  async sendMessage(message: string, context?: ChatContext): Promise<string> {
    // Add custom pre-processing
    const processed = this.preprocessMessage(message);

    // Call parent
    const response = await super.sendMessage(processed, context);

    // Add custom post-processing
    return this.postprocessResponse(response);
  }
}
```

### Response Caching

```typescript
const cache = new Map<string, string>();

async function cachedSendMessage(message: string): Promise<string> {
  if (cache.has(message)) {
    return cache.get(message)!;
  }

  const response = await mockClaudeAPI.sendMessage(message);
  cache.set(message, response);
  return response;
}
```

### Batch Processing

```typescript
async function batchProcess(messages: string[]): Promise<string[]> {
  const api = new MockClaudeAPI({ minDelay: 10, maxDelay: 50 });

  return Promise.all(
    messages.map(msg => api.sendMessage(msg))
  );
}
```

## Limitations

- Responses are generated based on templates and don't involve actual AI reasoning
- No real understanding of complex queries beyond keyword matching
- Limited to predefined response patterns
- No support for multi-modal inputs (images, etc.)
- Conversation context is tracked but not deeply analyzed

## Future Enhancements

- [ ] More sophisticated keyword matching with NLP
- [ ] Support for custom response templates
- [ ] Response quality scoring and validation
- [ ] Multi-turn conversation coherence
- [ ] Mock error scenarios for testing error handling
- [ ] Response caching with TTL
- [ ] Rate limiting simulation
- [ ] Token usage tracking

## Examples

See `mockClaudeAPI.example.ts` for comprehensive usage examples including:

1. Simple messages
2. Context-aware conversations
3. Streaming responses
4. Custom configurations
5. Different query types
6. Conversation history management
7. API request format
8. Deterministic testing
9. Performance testing
10. Progress tracking

## License

Part of the Nabokov Web Clipper project.

## Contributing

When adding new response templates or features:

1. Add new keywords to the `RESPONSE_TEMPLATES` array
2. Create response variations for natural conversation flow
3. Update this documentation
4. Add examples demonstrating the new feature
5. Include tests for the new functionality

## Support

For issues or questions, please refer to the main project documentation or create an issue in the project repository.
