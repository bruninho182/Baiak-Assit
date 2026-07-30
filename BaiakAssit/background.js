// Apenas mantém o service worker ativo
chrome.runtime.onMessage.addListener(() => true);