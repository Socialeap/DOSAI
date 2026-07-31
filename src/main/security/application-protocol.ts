import { protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import {
  APPLICATION_SCHEME,
  PRODUCTION_CONTENT_SECURITY_POLICY,
  resolveApplicationResource,
} from './application-policy';

const RESPONSE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': PRODUCTION_CONTENT_SECURITY_POLICY,
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
});

function errorResponse(status: number): Response {
  return new Response(null, { headers: RESPONSE_HEADERS, status });
}

export function registerApplicationScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APPLICATION_SCHEME,
      privileges: {
        allowServiceWorkers: false,
        bypassCSP: false,
        codeCache: true,
        corsEnabled: false,
        secure: true,
        standard: true,
        stream: false,
        supportFetchAPI: false,
      },
    },
  ]);
}

export function installApplicationProtocol(rendererRoot: string): void {
  protocol.handle(APPLICATION_SCHEME, async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, {
        headers: { ...RESPONSE_HEADERS, Allow: 'GET, HEAD' },
        status: 405,
      });
    }

    const resource = resolveApplicationResource(request.url);
    if (resource === undefined) {
      return errorResponse(404);
    }

    const contentType = CONTENT_TYPES[extname(resource) as keyof typeof CONTENT_TYPES];
    if (contentType === undefined) {
      return errorResponse(404);
    }

    try {
      const body = request.method === 'HEAD' ? null : new Uint8Array(await readFile(join(rendererRoot, resource)));
      return new Response(body, {
        headers: { ...RESPONSE_HEADERS, 'Content-Type': contentType },
        status: 200,
      });
    } catch {
      return errorResponse(404);
    }
  });
}
