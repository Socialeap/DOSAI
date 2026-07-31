import { session } from 'electron';

import {
  DEVELOPMENT_CONTENT_SECURITY_POLICY,
  isAllowedSessionRequest,
} from './application-policy';

export function configureDefaultSession(isPackaged: boolean): void {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedSessionRequest(details.url, isPackaged) });
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isPackaged && isAllowedSessionRequest(details.url, false)) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [DEVELOPMENT_CONTENT_SECURITY_POLICY],
          'X-Content-Type-Options': ['nosniff'],
        },
      });
      return;
    }

    callback(details.responseHeaders === undefined ? {} : { responseHeaders: details.responseHeaders });
  });
}
