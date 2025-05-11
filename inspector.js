(() => {
  const TRIGGER_KEY = 'Alt';
  let inspecting = false;
  let tooltipDiv = null;
  let raf = null;
  const MAX_HIERARCHY_LEVELS = 4; // Current component + 4 parents

  /* ------------------------------------------------------------------ */
  /*  Tooltip helpers                                                   */
  /* ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ */
  /*  React helpers                                                     */
  /* ------------------------------------------------------------------ */
  function hasHook() {
    return (
      !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ &&
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers &&
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.size > 0
    );
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

  function displayNameForFiber(fiber) {
    if (!fiber) return null;

    // Climb out of host fibers (div, span, etc.) to user code
    let f = fiber;
    while (f && typeof f.type === 'string') f = f.return || null;
    if (!f) f = fiber;

    const type = f.type;
    if (!type) return null;

    // handle ForwardRef / Memo wrappers
    const resolved = type.render || type.type || type;
    return (
      resolved.displayName ||
      resolved.name ||
      (typeof resolved === 'string' ? resolved : 'Anonymous')
    );
  }

  function getComponentHierarchyDisplay(initialFiber) {
    const names = [];
    let currentFiber = initialFiber;
    let meaningfulNamesCount = 0; // Counter for non-anonymous component names

    // Loop as long as there's a fiber and we haven't found enough meaningful names
    while (currentFiber && meaningfulNamesCount < MAX_HIERARCHY_LEVELS) {
      const name = displayNameForFiber(currentFiber);

      if (!name) {
        // If displayNameForFiber returns null (e.g., fiber.type is null or some other issue), stop.
        break;
      }

      if (name !== 'Anonymous') {
        names.unshift(name); // Add to the beginning for Parent > Child order
        meaningfulNamesCount++; // Increment count only for non-anonymous names
      }
      // If name is 'Anonymous', we skip adding it and don't increment meaningfulNamesCount.
      // The loop will continue to the parent.

      // Determine the actual fiber whose name was resolved by displayNameForFiber
      // to correctly move to its parent for the next iteration.
      let resolvedFiber = currentFiber;
      const originalFiberForThisIteration = currentFiber; // Save for the case where climbing results in null

      while (resolvedFiber && typeof resolvedFiber.type === 'string') {
        resolvedFiber = resolvedFiber.return || null;
      }
      if (!resolvedFiber) {
        // If climbing resulted in null, displayNameForFiber used the original fiber
        resolvedFiber = originalFiberForThisIteration;
      }

      // Move to the parent of the fiber whose name was just processed (or skipped if Anonymous)
      currentFiber = resolvedFiber ? resolvedFiber.return : null;
    }
    return names.join(' > ');
  }

  /* ------------------------------------------------------------------ */
  /*  Event handlers                                                    */
  /* ------------------------------------------------------------------ */
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
      const fiber = findFiber(evt.target);
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

  /* ------------------------------------------------------------------ */
  /*  Start / stop inspect mode                                         */
  /* ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ */
  /*  Global key listeners                                              */
  /* ------------------------------------------------------------------ */
  window.addEventListener('keydown', (e) => {
    if (e.key === TRIGGER_KEY) startInspect();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === TRIGGER_KEY && inspecting) {
      stopInspect();
    }
  });
})();
