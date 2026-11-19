import assert from 'node:assert/strict';
import test from 'node:test';
import { openMcpSession } from '../../tools/local-coordination-pilot/mcp-session.mjs';

const encode = value => Buffer.from(JSON.stringify(value));
const initialize = {
  jsonrpc: '2.0', id: 2, method: 'initialize',
  params: { protocolVersion: '2025-06-18', clientInfo: { name: 'fixture', version: '1' }, capabilities: {} },
};

function fixture() {
  const invocations = [];
  const rpc = openMcpSession({
    tools: () => [],
    call(name, args) {
      invocations.push({ name, args });
      return { ok: true };
    },
    close() {
      invocations.push('closed');
    },
  });
  return { rpc, invocations };
}

test('MCP lifecycle delays calls until initialized and rejects repeated request IDs', () => {
  const { rpc, invocations } = fixture();
  assert.equal(rpc.handle(encode({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).error.code, -32002);
  assert.equal(rpc.handle(encode(initialize)).result.protocolVersion, '2025-06-18');
  assert.equal(rpc.handle(encode({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })), undefined);
  assert.deepEqual(rpc.handle(encode({ jsonrpc: '2.0', id: 3, method: 'tools/list' })).result.tools, []);

  const call = {
    jsonrpc: '2.0', id: 4, method: 'tools/call',
    params: { name: 'dosai_read_project', arguments: {} },
  };
  assert.equal(rpc.handle(encode(call)).result.content[0].text, '{"ok":true}');
  assert.equal(rpc.handle(encode(call)).error.code, -32600);
  assert.deepEqual(invocations, [{ name: 'dosai_read_project', args: {} }, 'closed']);
  assert.throws(() => rpc.handle(encode(initialize)), /closed/);
});

test('oversized, invalid UTF-8 or ambiguous input closes before dispatch', async t => {
  const rejected = [
    ['size', Buffer.alloc(4097, ' ')],
    ['UTF-8', Buffer.from([0xc0, 0xaf])],
    ['duplicate key', Buffer.from('{"jsonrpc":"2.0","method":"ping","method":"initialize"}')],
  ];
  for (const [label, bytes] of rejected) {
    await t.test(label, () => {
      const { rpc, invocations } = fixture();
      assert.equal(rpc.handle(bytes).error.code, -32700);
      assert.deepEqual(invocations, ['closed']);
      assert.throws(() => rpc.handle(encode(initialize)), /closed/);
    });
  }
});
