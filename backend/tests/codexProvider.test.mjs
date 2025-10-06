import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createCodexProvider } from '../lib/llm/providers/codexProvider.js';

function createFakeSpawn(events, { exitCode = 0, stderr = '' } = {}) {
  return mock.fn(() => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = mock.fn();

    process.nextTick(() => {
      for (const event of events) {
        child.stdout.write(`${JSON.stringify(event)}\n`);
      }
      child.stdout.end();
      if (stderr) {
        child.stderr.write(stderr);
      }
      child.stderr.end();
      child.emit('close', exitCode);
    });

    return child;
  });
}

describe('codexProvider', () => {
  it('aggregates CLI output when send() is called', async () => {
    const spawnMock = createFakeSpawn([
      { type: 'item.delta', delta: { text: 'Hello' } },
      { type: 'item.delta', delta: { text: ' world' } },
      { type: 'turn.completed' },
    ]);

    const provider = createCodexProvider(spawnMock);

    const result = await provider.send({ prompt: 'Say hello' });

    assert.equal(result.content, 'Hello world');
    assert.equal(result.metadata.provider, 'codex-cli');
    assert.equal(spawnMock.mock.calls.length, 1);
    const call = spawnMock.mock.calls[0];
    assert.equal(call.arguments[0], 'codex');
    assert.deepEqual(call.arguments[1], ['exec', '--json', '-']);
  });

  it('passes streaming chunks to onToken and resolves on completion', async () => {
    const spawnMock = createFakeSpawn([
      { type: 'item.delta', delta: { text: 'foo' } },
      { type: 'item.delta', delta: { text: 'bar' } },
      { type: 'turn.completed' },
    ]);

    const provider = createCodexProvider(spawnMock);

    const chunks = [];
    let done = false;

    await provider.stream({
      prompt: 'Test streaming',
      onToken: token => chunks.push(token),
      onDone: () => {
        done = true;
      },
      onError: error => {
        throw error;
      }
    });

    assert.deepEqual(chunks, ['foo', 'bar']);
    assert.equal(done, true);
  });

  it('rejects when the Codex process exits with an error', async () => {
    const spawnMock = createFakeSpawn([], { exitCode: 1, stderr: 'boom' });
    const provider = createCodexProvider(spawnMock);

    await assert.rejects(
      () => provider.send({ prompt: 'Will fail' }),
      /boom|Codex process exited/
    );
  });

  it('preserves requested model metadata on unsupported model errors', async () => {
    const spawnMock = createFakeSpawn([
      { type: 'error', message: 'stream error: unexpected status 400 Bad Request: {"detail":"Unsupported model"}' },
    ]);

    const provider = createCodexProvider(spawnMock);

    await assert.rejects(
      () => provider.send({
        prompt: 'bad model',
        options: {
          providerOptions: { model: 'claude-3-5-sonnet-20240620' },
          requestedModel: 'claude-3-5-sonnet-20240620'
        }
      }),
      error => {
        assert.equal(error.code, 'UNSUPPORTED_MODEL');
        assert.equal(error.requestedModel, 'claude-3-5-sonnet-20240620');
        return true;
      }
    );

    const call = spawnMock.mock.calls[0];
    assert.ok(call.arguments[1].includes('--model'));
  });
});
