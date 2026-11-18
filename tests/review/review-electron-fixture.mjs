export const handlers = new Map();
export const browserWindows = new Map();
export const confirmation = { respond: () => ({ response: 0 }) };

export const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
export const dialog = { showMessageBox: async (...args) => confirmation.respond(...args) };
export const BrowserWindow = { fromWebContents: (sender) => browserWindows.get(sender) ?? null };
