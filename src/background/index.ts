// Background service worker for Nabokov Web Clipper

chrome.runtime.onInstalled.addListener(() => {
  console.log('Nabokov Web Clipper installed');

  // Create context menus
  chrome.contextMenus.create({
    id: 'clip-to-canvas',
    title: 'Clip to Canvas',
    contexts: ['selection', 'image', 'link', 'page']
  });

  chrome.contextMenus.create({
    id: 'chat-with-element',
    title: '💬 Chat about this',
    contexts: ['all']
  });
});

// Handle keyboard commands
chrome.commands.onCommand.addListener((command) => {
  console.log('[background] Command received:', command);

  if (command === 'activate-selector') {
    // Get the active tab and send message to activate element selector
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        console.log('[background] Activating selector (Canvas mode) on tab:', tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'ACTIVATE_SELECTOR',
          payload: {
            stashImmediately: false
          },
          stashImmediately: false // Keep for backward compat
        }).catch(err => {
          console.error('[background] Failed to send ACTIVATE_SELECTOR message:', err);
          console.error('[background] This usually means content script is not loaded. Try refreshing the page.');
        });
      } else {
        console.error('[background] No active tab found for activate-selector');
      }
    });
  } else if (command === 'activate-selector-stash') {
    // Activate element selector with stash mode enabled
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        console.log('[background] Activating selector (Stash mode) on tab:', tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'ACTIVATE_SELECTOR',
          payload: {
            stashImmediately: true
          },
          stashImmediately: true // Keep for backward compat
        }).catch(err => {
          console.error('[background] Failed to send ACTIVATE_SELECTOR (stash) message:', err);
          console.error('[background] This usually means content script is not loaded. Try refreshing the page.');
        });
      } else {
        console.error('[background] No active tab found for activate-selector-stash');
      }
    });
  } else if (command === 'toggle-inline-chat') {
    // Activate chat selector (element-attached chat mode)
    console.log('[background] Activating chat selector...');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        console.log('[background] Sending ACTIVATE_CHAT_SELECTOR to tab:', tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'ACTIVATE_CHAT_SELECTOR'
        }).catch(err => {
          console.error('[background] Failed to send ACTIVATE_CHAT_SELECTOR message:', err);
          console.error('[background] This usually means content script is not loaded. Try refreshing the page.');
        });
      } else {
        console.error('[background] No active tab found for toggle-inline-chat');
      }
    });
  } else {
    console.warn('[background] Unknown command received:', command);
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'clip-to-canvas' && tab?.id) {
    // Send message to content script to start clipping
    chrome.tabs.sendMessage(tab.id, {
      type: 'START_CLIPPING',
      data: {
        selectionText: info.selectionText,
        linkUrl: info.linkUrl,
        srcUrl: info.srcUrl,
        pageUrl: info.pageUrl
      }
    });
  } else if (info.menuItemId === 'chat-with-element' && tab?.id) {
    // Open element-contextual chat
    console.log('[background] Opening element chat from context menu');
    chrome.tabs.sendMessage(tab.id, {
      type: 'OPEN_ELEMENT_CHAT',
      data: {
        selectionText: info.selectionText,
        linkUrl: info.linkUrl,
        srcUrl: info.srcUrl
      }
    }).catch(err => {
      console.error('[background] Failed to send element chat message:', err);
    });
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    // Open canvas in new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/canvas/index.html')
    });
  }
});

// Handle messages from content scripts or canvas
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[background] Received message:', message.type);

  if (message.type === 'OPEN_CANVAS') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/canvas/index.html')
    });
    sendResponse({ success: true });
    return true;
  }

  console.warn('[background] Unknown message type:', message.type);
  sendResponse({ success: false, error: 'Unknown message type' });
  return false;
});