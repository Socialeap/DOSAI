export const APPLICATION_SCHEME = 'dosai';
export const APPLICATION_HOST = 'app';
export const PRODUCTION_RENDERER_URL = `${APPLICATION_SCHEME}://${APPLICATION_HOST}/`;
export const DEVELOPMENT_RENDERER_URL = 'http://127.0.0.1:5173/';

export const PRODUCTION_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "worker-src 'none'",
].join('; ');

export const DEVELOPMENT_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  'connect-src http://127.0.0.1:5173 ws://127.0.0.1:5173',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "worker-src 'none'",
].join('; ');

export interface IpcSenderIdentity {
  readonly frameUrl: string | undefined;
  readonly isMainFrame: boolean;
  readonly ownerWebContentsId: number | undefined;
  readonly senderWebContentsId: number;
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function hasCleanAuthority(url: URL): boolean {
  return url.username === '' && url.password === '' && url.port === '';
}

export function resolveApplicationResource(value: string): string | undefined {
  const url = parseUrl(value);
  if (
    url === undefined ||
    url.protocol !== `${APPLICATION_SCHEME}:` ||
    url.hostname !== APPLICATION_HOST ||
    !hasCleanAuthority(url) ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return undefined;
  }

  if (value === PRODUCTION_RENDERER_URL || value === `${PRODUCTION_RENDERER_URL}index.html`) {
    return 'index.html';
  }

  const asset = /^dosai:\/\/app\/assets\/([A-Za-z0-9_-]+\.(?:css|js))$/.exec(value);
  return asset?.[1] === undefined ? undefined : `assets/${asset[1]}`;
}

export function isTrustedRendererUrl(value: string, isPackaged: boolean): boolean {
  return value === (isPackaged ? PRODUCTION_RENDERER_URL : DEVELOPMENT_RENDERER_URL);
}

export function isAllowedSessionRequest(value: string, isPackaged: boolean): boolean {
  if (isPackaged) {
    return resolveApplicationResource(value) !== undefined;
  }

  const url = parseUrl(value);
  return (
    url !== undefined &&
    (url.protocol === 'http:' || url.protocol === 'ws:') &&
    url.hostname === '127.0.0.1' &&
    url.port === '5173' &&
    url.username === '' &&
    url.password === ''
  );
}

export function isTrustedIpcSender(identity: IpcSenderIdentity, isPackaged: boolean): boolean {
  return (
    identity.ownerWebContentsId === identity.senderWebContentsId &&
    identity.isMainFrame &&
    identity.frameUrl !== undefined &&
    isTrustedRendererUrl(identity.frameUrl, isPackaged)
  );
}
