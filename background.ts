/**
 * The service worker, which does almost nothing.
 *
 * It exists to own the context menu and the keyboard command, and to inject
 * the panel. It never sees the selected text: the decoding happens in the page
 * and the result is shown there.
 *
 * That is also why there are no host permissions. Both a context menu click
 * and a command shortcut are gestures that grant activeTab for that one tab,
 * so this extension never needs standing access to anything.
 */

const MENU_ID = 'cribsheet-decode';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Decode with Cribsheet',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || tab?.id === undefined) return;
  void show(tab.id, info.selectionText ?? '');
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'decode-selection') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const id = tabs[0]?.id;
    if (id !== undefined) void show(id, '');
  });
});

async function show(tabId: number, fallback: string): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['dist/panel.js'] });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (text: string) => window.__cribsheetShow?.(text),
      args: [fallback],
    });
  } catch {
    // Chrome refuses injection into its own pages and the web store. There is
    // nowhere to show a message in that case, and a notification for it would
    // be worse than silence.
  }
}
