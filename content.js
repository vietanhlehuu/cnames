const inspectorTag = document.createElement('script');
inspectorTag.src = chrome.runtime.getURL('inspector.js');
inspectorTag.async = false;
document.documentElement.appendChild(inspectorTag);
