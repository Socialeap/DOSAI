import { DEVELOPMENT_RENDERER_URL } from '../security/application-policy';

export function resolveDevelopmentRendererUrl(
  value: string | undefined,
  isPackaged: boolean,
): string | undefined {
  if (isPackaged || value === undefined) {
    return undefined;
  }

  const url = new URL(value);
  if (url.toString() !== DEVELOPMENT_RENDERER_URL) {
    throw new Error('Invalid DOSAI development renderer URL');
  }

  return url.toString();
}
