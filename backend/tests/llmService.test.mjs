import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

let importCounter = 0;

function createServiceModule() {
  return import(`../lib/llm/index.js?test=${++importCounter}`);
}

function createMessages() {
  return [
    { role: 'system', content: 'Assist the user.' },
    { role: 'user', content: 'Hello there' },
  ];
}

describe('createLLMService', () => {
  beforeEach(() => {
    delete process.env.LLM_PROVIDER;
    delete process.env.USE_CLAUDE;
  });

  afterEach(() => {
    mock.reset();
  });

  it('uses Codex provider by default and forwards prompts', async () => {
    const codexStub = {
      name: 'codex-cli',
      send: mock.fn(async ({ prompt, options }) => ({
        content: prompt,
        metadata: { requestId: 'default-codex', options },
      })),
      stream: mock.fn(),
    };

    const claudeStub = {
      name: 'claude-agent',
      send: mock.fn(),
      stream: mock.fn(),
    };

    const { createLLMService } = await createServiceModule();
    const service = createLLMService({ providers: { codex: codexStub, claude: claudeStub } });

    const response = await service.sendMessage({
      messages: createMessages().slice(1),
      options: {
        system: 'Assist the user.',
        model: 'claude-3-5-sonnet-20240620',
        providerOptions: { profile: 'dev' },
      }
    });

    assert.equal(service.getProviderKey(), 'codex');
    assert.equal(service.getProviderName(), 'codex-cli');
    assert.equal(codexStub.send.mock.calls.length, 1);
    const callArgs = codexStub.send.mock.calls[0].arguments[0];
    assert.equal(callArgs.prompt, 'Assist the user.\n\nUser: Hello there');
    assert.equal(callArgs.options.model, undefined);
    assert.equal(callArgs.options.requestedModel, 'claude-3-5-sonnet-20240620');
    assert.equal(callArgs.options.resolvedModel, 'claude-3-5-sonnet-20240620');
    assert.deepEqual(callArgs.options.providerOptions, { profile: 'dev', model: 'claude-3-5-sonnet-20240620' });
    assert.equal(response.content, 'Assist the user.\n\nUser: Hello there');
    assert.equal(response.metadata.providerKey, 'codex');
    assert.equal(response.metadata.provider, 'codex-cli');
    assert.equal(response.metadata.source, 'codex-cli');
    assert.ok(typeof response.metadata.timestamp === 'number');
    assert.equal(response.metadata.requestedModel, 'claude-3-5-sonnet-20240620');
    assert.equal(response.metadata.resolvedModel, 'claude-3-5-sonnet-20240620');
  });

  it('fills default models for codex and claude when none provided', async () => {
    const codexStub = {
      name: 'codex-cli',
      send: mock.fn(async () => ({ content: 'codex', metadata: {} })),
      stream: mock.fn(),
    };

    const claudeStub = {
      name: 'claude-agent',
      send: mock.fn(async () => ({ content: 'claude', metadata: {} })),
      stream: mock.fn(),
    };

    const { createLLMService } = await createServiceModule();
    const service = createLLMService({ providers: { codex: codexStub, claude: claudeStub } });

    await service.sendMessage({
      messages: [{ role: 'user', content: 'hello' }],
      options: {},
    });

    const codexCall = codexStub.send.mock.calls[0];
    assert.equal(codexCall.arguments[0].options.requestedModel, undefined);
    assert.equal(codexCall.arguments[0].options.resolvedModel, 'gpt5-codex');
    assert.equal(codexCall.arguments[0].options.providerOptions, undefined);

    process.env.LLM_PROVIDER = 'claude';
    const claudeService = createLLMService({ providers: { codex: codexStub, claude: claudeStub } });
    await claudeService.sendMessage({
      messages: [{ role: 'user', content: 'hello' }],
      options: {},
    });

    const claudeCall = claudeStub.send.mock.calls.at(-1);
    assert.equal(claudeCall.arguments[0].options.model, 'sonnet');
    assert.equal(claudeCall.arguments[0].options.resolvedModel, 'sonnet');
  });

  it('switches to Claude provider when LLM_PROVIDER=claude', async () => {
    process.env.LLM_PROVIDER = 'claude';

    const codexStub = {
      name: 'codex-cli',
      send: mock.fn(),
      stream: mock.fn(),
    };

    const claudeStub = {
      name: 'claude-agent',
      send: mock.fn(async () => ({ content: 'hi', metadata: {} })),
      stream: mock.fn(),
    };

    const { createLLMService } = await createServiceModule();
    const service = createLLMService({ providers: { codex: codexStub, claude: claudeStub } });

    assert.equal(service.getProviderKey(), 'claude');
    await service.sendMessage({
      messages: createMessages().slice(1),
      options: {}
    });

    assert.equal(claudeStub.send.mock.calls.length, 1);
    assert.equal(codexStub.send.mock.calls.length, 0);
  });

  it('coerces Claude release-specific model names to short identifiers', async () => {
    process.env.LLM_PROVIDER = 'claude';

    const claudeStub = {
      name: 'claude-agent',
      send: mock.fn(async ({ options }) => ({
        content: 'hi',
        metadata: { echoedModel: options.model },
      })),
      stream: mock.fn(),
    };

    const { createLLMService } = await createServiceModule();
    const service = createLLMService({ providers: { claude: claudeStub } });

    const response = await service.sendMessage({
      messages: [{ role: 'user', content: 'check model mapping' }],
      options: { model: 'sonnet' },
    });

    const claudeCall = claudeStub.send.mock.calls[0].arguments[0];
    assert.equal(claudeCall.options.model, 'sonnet');
    assert.equal(claudeCall.options.requestedModel, 'sonnet');
    assert.equal(claudeCall.options.resolvedModel, 'sonnet');
    assert.equal(response.metadata.requestedModel, 'sonnet');
    assert.equal(response.metadata.resolvedModel, 'sonnet');
    assert.equal(response.metadata.providerKey, 'claude');
    assert.equal(response.metadata.provider, 'claude-agent');
  });

  it('throws INVALID_REQUEST when messages are missing', async () => {
    const { createLLMService } = await createServiceModule();
    const codexStub = {
      name: 'codex',
      send: mock.fn(),
      stream: mock.fn(),
    };
    const service = createLLMService({ providers: { codex: codexStub, claude: codexStub } });

    await assert.rejects(
      () => service.sendMessage({ messages: [], options: {} }),
      error => error.code === 'INVALID_REQUEST'
    );
  });

  it('throws UNSUPPORTED_MULTIMODAL when messages contain arrays', async () => {
    const { createLLMService } = await createServiceModule();
    const codexStub = {
      name: 'codex',
      send: mock.fn(),
      stream: mock.fn(),
    };
    const service = createLLMService({ providers: { codex: codexStub, claude: codexStub } });

    await assert.rejects(
      () => service.sendMessage({
        messages: [{ role: 'user', content: [{ type: 'image', source: 'data' }] }],
        options: {}
      }),
      error => error.code === 'UNSUPPORTED_MULTIMODAL'
    );
  });

  it('invokes stream handler callbacks in order', async () => {
    const tokens = [];

    const codexStub = {
      name: 'codex',
      send: mock.fn(),
      stream: mock.fn(async ({ onToken, onDone }) => {
        onToken('A');
        onToken('B');
        onDone();
      }),
    };

    const { createLLMService } = await createServiceModule();
    const service = createLLMService({ providers: { codex: codexStub, claude: codexStub } });

    await service.streamMessage({
      messages: [{ role: 'user', content: 'Stream please' }],
      options: {},
      onToken: token => tokens.push(token),
      onDone: () => tokens.push('DONE'),
      onError: error => {
        throw error;
      }
    });

    assert.deepEqual(tokens, ['A', 'B', 'DONE']);
  });
});
