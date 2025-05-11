(() => {
  const hookTag = document.createElement('script');
  hookTag.src = chrome.runtime.getURL('hook.js');
  hookTag.async = false;
  document.documentElement.appendChild(hookTag);

  const inspectorTag = document.createElement('script');
  inspectorTag.src = chrome.runtime.getURL('inspector.js');
  inspectorTag.async = false;
  document.documentElement.appendChild(inspectorTag);
})();
