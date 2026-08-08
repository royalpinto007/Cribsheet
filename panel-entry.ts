import { showPopover } from './src/popover.js';

/**
 * The script injected into the page.
 *
 * Everything, including the decoding, happens here. Nothing is sent to the
 * service worker and nothing crosses a process boundary, which is what makes
 * the privacy claim on the listing a structural fact rather than a promise.
 */
declare global {
  interface Window {
    __cribsheetShow?: (fallback?: string) => number;
  }
}

window.__cribsheetShow = (fallback?: string) => {
  const selected = window.getSelection()?.toString() ?? '';
  // The live selection is preferred over what the context menu passed, because
  // Chrome collapses whitespace in selectionText and that changes the value.
  return showPopover(selected.trim() || (fallback ?? ''));
};

export {};
