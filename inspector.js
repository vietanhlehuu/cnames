// inspector.js – with edge-aware tooltip
(() => {
  const TRIGGER_KEY = 'Alt';
  const MAX_HIERARCHY_LEVELS = 4; // Current component + n parents
  const OFFSET = 12; // Distance from cursor
  const MARGIN = 8; // Min distance from viewport edge

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
      whiteSpace: 'nowrap',
      transition: 'opacity 75ms linear',
      opacity: '0',
    });
    document.body.appendChild(tooltipDiv);
  }

  function showTooltip(text, mouseX, mouseY) {
    ensureTooltip();
    tooltipDiv.textContent = text;
    tooltipDiv.style.opacity = '1';

    /* 1. render off-screen to measure */
    tooltipDiv.style.left = '-9999px';
    tooltipDiv.style.top = '-9999px';
    const { width, height } = tooltipDiv.getBoundingClientRect();

    /* 2. initial position to bottom-right of cursor */
    let x = mouseX + OFFSET;
    let y = mouseY + OFFSET;

    /* 3. flip horizontally if overflowing right edge */
    if (x + width + MARGIN > window.innerWidth) {
      x = mouseX - width - OFFSET;
      if (x < MARGIN) x = window.innerWidth - width - MARGIN;
    }

    /* 4. flip vertically if overflowing bottom edge */
    if (y + height + MARGIN > window.innerHeight) {
      y = mouseY - height - OFFSET;
      if (y < MARGIN) y = window.innerHeight - height - MARGIN;
    }

    /* 5. clamp to top/left margins */
    if (x < MARGIN) x = MARGIN;
    if (y < MARGIN) y = MARGIN;

    tooltipDiv.style.left = `${x}px`;
    tooltipDiv.style.top = `${y}px`;
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

  // Walk up from text/comment to an element
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
   *  Fiber & name utilities                                           *
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
    if (typeof inner === 'string') return inner; // host tag
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
      if (name && name !== 'Anonymous' && name.length > 2) names.unshift(name);
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
        showTooltip(hierarchyName, evt.clientX, evt.clientY);
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
