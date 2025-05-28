// inspector.js – with edge-aware tooltip
(() => {
  const TRIGGER_KEY = 'Alt';
  const MAX_HIERARCHY_LEVELS = 5; // Current component + n parents
  const OFFSET = 12; // Distance from cursor
  const MARGIN = 8; // Min distance from viewport edge
  const NO_DEVTOOLS_MESSAGE =
    'React DevTools not detected. Please install the React Developer Tools extension.';

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

    // Try to find fiber directly from node's internal properties first
    if (node) {
      // Check for _reactRootContainer (used by some React versions)
      if (node._reactRootContainer?._internalRoot?.current) {
        return node._reactRootContainer._internalRoot.current;
      }

      // Check for __reactFiber random key (used by Remix and newer React)
      const fiberKey = Object.keys(node).find((key) =>
        key.startsWith('__reactFiber')
      );
      if (fiberKey && node[fiberKey]) {
        return node[fiberKey];
      }

      // Check for __reactInternalInstance (older versions)
      const internalKey = Object.keys(node).find((key) =>
        key.startsWith('__reactInternalInstance')
      );
      if (internalKey && node[internalKey]) {
        return node[internalKey];
      }
    }

    // Fall back to renderer methods
    for (const renderer of hook.renderers.values()) {
      try {
        // Try different methods to get fiber
        if (renderer.current?.findFiberByHostInstance) {
          const fiber = renderer.current.findFiberByHostInstance(node);
          if (fiber) return fiber;
        }

        if (renderer.findFiberByHostInstance) {
          const fiber = renderer.findFiberByHostInstance(node);
          if (fiber) return fiber;
        }

        if (renderer.getFiberFromNode) {
          const fiber = renderer.getFiberFromNode(node);
          if (fiber) return fiber;
        }
      } catch (err) {
        console.error('React Component Names--Error finding fiber:', err);
      }
    }

    return null;
  }

  /* ────────────────────────────────────────────────────────────────── *
   *  Fiber & name utilities                                           *
   * ────────────────────────────────────────────────────────────────── */
  const USER_COMPONENT_TAGS = new Set([
    0, // FunctionComponent
    1, // ClassComponent
    //2,  // IndeterminateComponent
    //3,  // HostRoot
    4, // HostPortal
    //5,  // HostComponent (DOM elements like div, span)
    //6,  // HostText
    //7,  // Fragment
    //8,  // Mode
    //9,  // ContextConsumer
    //10, // ContextProvider
    11, // ForwardRef
    //12, // Profiler
    //13, // SuspenseComponent
    14, // MemoComponent
    15, // SimpleMemoComponent (React <18)
    16, // LazyComponent
    //17, // IncompleteClassComponent
    //21, // CacheComponent
    //22, // TracingMarkerComponent
    //23, // HostHoistable
    //24, // HostSingleton
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

  function getOwnerFiber(fiber) {
    if (!fiber) return null;

    // Try owner properties first (these represent who actually rendered this component)
    if (fiber._debugOwner) return fiber._debugOwner;
    if (fiber._owner) return fiber._owner;

    return null;
  }

  function getParentFiber(fiber) {
    if (!fiber) return null;

    // Traverse up the return chain but only return userland components
    let p = fiber.return;
    while (p) {
      if (isUserland(p)) return p;
      p = p.return;
    }
    return null;
  }

  function getComponentHierarchyDisplay(startFiber) {
    if (!startFiber) return '';

    // First, try to build hierarchy using owner chain
    const ownerNames = [];
    let current = startFiber;

    while (current && ownerNames.length < MAX_HIERARCHY_LEVELS) {
      if (isUserland(current)) {
        const name = displayNameForFiber(current);
        if (name && name !== 'Anonymous' && name.length > 2) {
          ownerNames.push(name);
        }
      }
      current = getOwnerFiber(current);
    }

    // If we found a meaningful owner hierarchy, use it
    if (ownerNames.length > 1) {
      return ownerNames.reverse().join(' > ');
    }

    // Fallback: build hierarchy using parent chain
    const parentNames = [];
    current = startFiber;

    while (current && parentNames.length < MAX_HIERARCHY_LEVELS) {
      if (isUserland(current)) {
        const name = displayNameForFiber(current);
        if (name && name !== 'Anonymous' && name.length > 2) {
          parentNames.push(name);
        }
      }
      current = getParentFiber(current);
    }

    return parentNames.reverse().join(' > ');
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
      if (!hasHook()) {
        showTooltip(NO_DEVTOOLS_MESSAGE, evt.clientX, evt.clientY);
        return;
      }
      if (!inspecting) {
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
