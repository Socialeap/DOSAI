import { parseStrictJsonBytes } from '../../src/contracts/strict-json.ts';

const protocolVersion = '2025-06-18';
const maxRequestBytes = 4096;
const maxRequests = 96;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function allowedKeys(record, keys) {
  return Object.keys(record).every(key => keys.includes(key));
}

function response(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function fault(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// Takes one complete JSON-RPC message from an already-bound control channel.
// Agent console output is not a control channel. There is no CLI entry point.
export function openMcpSession(endpoint) {
  const ids = new Set();
  let phase = 'new';

  function close() {
    if (phase === 'closed') return;
    phase = 'closed';
    endpoint.close();
  }

  function handle(bytes) {
    if (phase === 'closed') throw new Error('MCP session closed.');
    let request;
    try {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxRequestBytes) throw new Error();
      request = parseStrictJsonBytes(bytes);
    } catch {
      close();
      return fault(null, -32700, 'Invalid message.');
    }

    const id = request?.id;
    const identified = Number.isSafeInteger(id) || (typeof id === 'string' && id.length > 0 && id.length <= 64);
    if (!isRecord(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string' ||
        !allowedKeys(request, ['jsonrpc', 'id', 'method', 'params']) ||
        (Object.hasOwn(request, 'id') && !identified)) {
      close();
      return fault(null, -32600, 'Invalid request.');
    }

    if (!identified) {
      const params = request.params;
      if (request.method === 'notifications/initialized' && phase === 'initializing' &&
          (params === undefined || (isRecord(params) && allowedKeys(params, ['_meta'])))) phase = 'ready';
      return undefined;
    }
    if (ids.has(id) || ids.size >= maxRequests) {
      close();
      return fault(id, -32600, 'Request limit or duplicate ID.');
    }
    ids.add(id);

    const { method, params } = request;
    if (method === 'initialize' && phase === 'new') {
      if (!isRecord(params) || typeof params.protocolVersion !== 'string' ||
          !isRecord(params.capabilities) || !isRecord(params.clientInfo) ||
          typeof params.clientInfo.name !== 'string' || typeof params.clientInfo.version !== 'string') {
        close();
        return fault(id, -32602, 'Invalid initialization.');
      }
      phase = 'initializing';
      return response(id, {
        protocolVersion, capabilities: { tools: {} },
        serverInfo: { name: 'dosai-local-coordination-pilot', version: '0.1.0' },
      });
    }
    if (method === 'ping') return response(id, {});
    if (phase !== 'ready') return fault(id, -32002, 'Initialize first.');

    try {
      if (method === 'tools/list') {
        if (params !== undefined && (!isRecord(params) || !allowedKeys(params, ['_meta']))) {
          return fault(id, -32602, 'Invalid tool list parameters.');
        }
        return response(id, { tools: endpoint.tools() });
      }
      if (method === 'tools/call') {
        if (!isRecord(params) || !allowedKeys(params, ['name', 'arguments', '_meta']) ||
            typeof params.name !== 'string' ||
            (params.arguments !== undefined && !isRecord(params.arguments))) {
          return fault(id, -32602, 'Invalid tool call parameters.');
        }
        const data = endpoint.call(params.name, params.arguments ?? {});
        return response(id, { content: [{ type: 'text', text: JSON.stringify(data) }] });
      }
    } catch {
      return response(id, { isError: true, content: [{ type: 'text', text: 'Coordination request rejected.' }] });
    }
    return fault(id, -32601, 'Method not available.');
  }

  return Object.freeze({ handle, close });
}
