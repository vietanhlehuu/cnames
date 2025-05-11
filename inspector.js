// inspector.js – full, improved version
(() => {
  const TRIGGER_KEY = 'Alt';
  const MAX_HIERARCHY_LEVELS = 5; // Current component + n parents

  let inspecting = false;
  let tooltipDiv = null;
  let raf = null;

  /* ────────────────────────────────────────────────────────────────── *
   *  Tooltip helpers                                                  *
   * ────────────────────────────────────────────────────────────────── */
  function ensureTooltip() {
    if (tooltipDiv) return;
    tooltipDiv = document.createElement('div');
    tooltipDiv.id = '__react_component_highlighter__';
    Object.assign(tooltipDiv.style, {
      position: 'fixed',
      zIndex: 2147483647,
      pointerEvents: 'none',
      background: 'rgba(0,0,0,0.8)',
      color: '#fff',
      fontSize: '12px',
      fontFamily: 'sans-serif',
      padding: '2px 6px',
      borderRadius: '3px',
      transform: 'translate(-50%, -150%)',
      whiteSpace: 'nowrap',
      transition: 'opacity 75ms linear',
      opacity: '0',
    });
    document.body.appendChild(tooltipDiv);
  }

  function showTooltip(text, x, y) {
    ensureTooltip();
    tooltipDiv.textContent = text;
    tooltipDiv.style.left = `${x}px`;
    tooltipDiv.style.top = `${y}px`;
    tooltipDiv.style.opacity = '1';
  }

  function hideTooltip() {
    if (tooltipDiv) tooltipDiv.style.opacity = '0';
  }

  /* ────────────────────────────────────────────────────────────────── *
   *  React hook helpers                                               *
   * ────────────────────────────────────────────────────────────────── */
  function hasHook() {
    return (
      !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ &&
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers &&
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.size > 0
    );
  }

  // Walk up from a text or comment node until we hit an element
  function ensureElement(node) {
    let n = node;
    while (n && n.nodeType !== 1) n = n.parentNode;
    return n;
  }

  function findFiber(node) {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook) return null;
    for (const renderer of hook.renderers.values()) {
      try {
        const fiber = renderer.findFiberByHostInstance(node);
        if (fiber) return fiber;
      } catch (_) {}
    }
    return null;
  }

  /* ────────────────────────────────────────────────────────────────── *
   *  Fiber-type utilities (mirrors DevTools logic)                    *
   * ────────────────────────────────────────────────────────────────── */
  const USER_COMPONENT_TAGS = new Set([
    0, // FunctionComponent
    1, // ClassComponent
    11, // ForwardRef
    14, // MemoComponent
    22, // SimpleMemoComponent (React 18+)
  ]);

  function isUserland(fiber) {
    return USER_COMPONENT_TAGS.has(fiber.tag);
  }

  // Unwrap Memo / ForwardRef once for a clean label
  function getDisplayType(type) {
    if (!type) return null;
    if (type.render) return type.render; // ForwardRef
    if (type.type) return type.type; // Memo
    return type;
  }

  function displayNameForFiber(fiber) {
    if (!fiber) return null;
    const inner = getDisplayType(fiber.type);
    if (!inner) return null;
    if (typeof inner === 'string') return inner; // host tag like 'div'
    return inner.displayName || inner.name || 'Anonymous';
  }

  function getParentComponentFiber(fiber) {
    let p = fiber?.return || null;
    while (p && !isUserland(p)) p = p.return;
    return p;
  }

  function getComponentHierarchyDisplay(startFiber) {
    const names = [];
    let current =
      startFiber && isUserland(startFiber)
        ? startFiber
        : getParentComponentFiber(startFiber);

    while (current && names.length < MAX_HIERARCHY_LEVELS) {
      const name = displayNameForFiber(current);
      if (name && name !== 'Anonymous') names.unshift(name);
      current = getParentComponentFiber(current);
    }
    return names.join(' > ');
  }

  /* ────────────────────────────────────────────────────────────────── *
   *  Event handlers                                                   *
   * ────────────────────────────────────────────────────────────────── */
  function onMove(evt) {
    if (!inspecting) return;
    evt.preventDefault();
    evt.stopPropagation();

    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!hasHook() || !inspecting) {
        hideTooltip();
        return;
      }
      const fiber = findFiber(ensureElement(evt.target));
      const hierarchyName = getComponentHierarchyDisplay(fiber);
      if (hierarchyName) {
        showTooltip(hierarchyName, evt.clientX + 12, evt.clientY + 12);
      } else {
        hideTooltip();
      }
    });
  }

  function stopEvent(evt) {
    if (inspecting) {
      evt.preventDefault();
      evt.stopPropagation();
    }
  }

  /* ────────────────────────────────────────────────────────────────── *
   *  Start / stop inspect mode                                        *
   * ────────────────────────────────────────────────────────────────── */
  function startInspect() {
    if (inspecting) return;
    inspecting = true;

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseover', onMove, true);
    document.addEventListener('mousedown', stopEvent, true);
    document.addEventListener('click', stopEvent, true);
  }

  function stopInspect() {
    if (!inspecting) return;
    inspecting = false;

    if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }

    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseover', onMove, true);
    document.removeEventListener('mousedown', stopEvent, true);
    document.removeEventListener('click', stopEvent, true);
    hideTooltip();
  }

  /* ────────────────────────────────────────────────────────────────── *
   *  Global key listeners                                             *
   * ────────────────────────────────────────────────────────────────── */
  window.addEventListener('keydown', (e) => {
    if (e.key === TRIGGER_KEY) startInspect();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === TRIGGER_KEY && inspecting) stopInspect();
  });
})();
