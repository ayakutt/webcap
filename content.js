// webcap content script
// Injected by background.js when capture is triggered

(function () {
  "use strict";

  // Prevent double-injection
  if (window.__webcap_active) return;
  window.__webcap_active = true;

  let mode = "rectangle"; // set by message from background
  let overlay = null;
  let selection = null;
  let hint = null;
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let highlightEl = null;
  let tooltipEl = null;
  let currentTarget = null;
  let ancestors = [];
  let ancestorIndex = 0;
  let captureTarget = null;
  let savedScrollX = 0;
  let savedScrollY = 0;
  let hiddenFixed = null;

  function init(captureMode) {
    mode = captureMode;
    if (mode === "rectangle") {
      startRectangleMode();
    } else {
      startComponentMode();
    }
  }

  // ─── Rectangle Mode ─────────────────────────────────────────

  function startRectangleMode() {
    overlay = document.createElement("div");
    overlay.id = "webcap-overlay";
    document.body.appendChild(overlay);

    hint = document.createElement("div");
    hint.id = "webcap-hint";
    hint.textContent = "Drag to select area · Tab for component mode · Esc to cancel";
    document.body.appendChild(hint);

    document.body.classList.add("webcap-active");
    overlay.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    selection = document.createElement("div");
    selection.id = "webcap-selection";
    document.body.appendChild(selection);
    overlay.classList.add("has-selection");

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    selection.style.left = x + "px";
    selection.style.top = y + "px";
    selection.style.width = w + "px";
    selection.style.height = h + "px";
  }

  function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    const rect = {
      x: Math.min(e.clientX, startX),
      y: Math.min(e.clientY, startY),
      width: Math.abs(e.clientX - startX),
      height: Math.abs(e.clientY - startY),
    };

    // Ignore tiny accidental clicks
    if (rect.width < 5 || rect.height < 5) {
      cleanup();
      return;
    }

    // Remove overlay, wait for repaint, then request capture
    cleanup();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const vv = window.visualViewport;
        const vvOffX = vv ? vv.offsetLeft : 0;
        const vvOffY = vv ? vv.offsetTop : 0;
        chrome.runtime.sendMessage({
          action: "capture-rect",
          mode: "rectangle",
          rect: { x: rect.x - vvOffX, y: rect.y - vvOffY, width: rect.width, height: rect.height },
          viewportWidth: vv ? vv.width : window.innerWidth,
        });
      });
    });
  }

  // ─── Component Mode ──────────────────────────────────────────

  function startComponentMode() {
    document.body.classList.add("webcap-component-mode");
    hint = document.createElement("div");
    hint.id = "webcap-hint";
    hint.textContent = "Hover to detect · Scroll/↑↓ to traverse · Click to capture · Tab for rectangle mode · Esc to cancel";
    document.body.appendChild(hint);

    highlightEl = document.createElement("div");
    highlightEl.id = "webcap-component-highlight";
    document.body.appendChild(highlightEl);

    tooltipEl = document.createElement("div");
    tooltipEl.id = "webcap-component-tooltip";
    document.body.appendChild(tooltipEl);

    document.addEventListener("mousemove", onComponentMouseMove, true);
    document.addEventListener("wheel", onComponentWheel, { capture: true, passive: false });
    document.addEventListener("click", onComponentClick, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onPageScroll, true);
  }

  function onComponentMouseMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === highlightEl || el === tooltipEl || el === hint) return;

    if (el !== currentTarget) {
      currentTarget = el;
      ancestors = buildAncestorChain(el);
      ancestorIndex = 0;
    }
    updateHighlight(ancestors[ancestorIndex], e.clientX, e.clientY);
  }

  function buildAncestorChain(el) {
    const chain = [];
    let node = el;
    while (node && node !== document && node !== document.documentElement) {
      chain.push(node);
      node = node.parentElement;
    }
    return chain;
  }

  function traverseUp() {
    if (!ancestors.length) return;
    ancestorIndex = Math.min(ancestorIndex + 1, ancestors.length - 1);
  }

  function traverseDown() {
    if (!ancestors.length) return;
    ancestorIndex = Math.max(ancestorIndex - 1, 0);
  }

  function onComponentWheel(e) {
    if (!ancestors.length) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.deltaY < 0) {
      traverseUp();
    } else {
      traverseDown();
    }
    updateHighlight(ancestors[ancestorIndex], e.clientX, e.clientY);
  }

  function onPageScroll() {
    if (mode === "component" && ancestors[ancestorIndex]) {
      const el = ancestors[ancestorIndex];
      const rect = el.getBoundingClientRect();
      if (highlightEl) {
        highlightEl.style.left = rect.left + "px";
        highlightEl.style.top = rect.top + "px";
        highlightEl.style.width = rect.width + "px";
        highlightEl.style.height = rect.height + "px";
      }
    }
  }

  function updateHighlight(el, mouseX, mouseY) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    highlightEl.style.left = rect.left + "px";
    highlightEl.style.top = rect.top + "px";
    highlightEl.style.width = rect.width + "px";
    highlightEl.style.height = rect.height + "px";

    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const classes = el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/).join(".")
      : "";
    const size = `${Math.round(rect.width)}×${Math.round(rect.height)}`;

    tooltipEl.textContent = "";

    const tagSpan = document.createElement("span");
    tagSpan.className = "tag";
    tagSpan.textContent = tag;
    tooltipEl.appendChild(tagSpan);

    if (id) {
      const idSpan = document.createElement("span");
      idSpan.className = "id";
      idSpan.textContent = id;
      tooltipEl.appendChild(idSpan);
    }

    if (classes) {
      const classSpan = document.createElement("span");
      classSpan.className = "class";
      classSpan.textContent = classes;
      tooltipEl.appendChild(classSpan);
    }

    const sizeSpan = document.createElement("span");
    sizeSpan.className = "size";
    sizeSpan.textContent = size;
    tooltipEl.appendChild(sizeSpan);

    const tooltipY = rect.top > 30 ? rect.top - 28 : rect.bottom + 6;
    tooltipEl.style.left = rect.left + "px";
    tooltipEl.style.top = tooltipY + "px";
  }

  function onComponentClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const el = ancestors[ancestorIndex];
    if (!el) return;
    captureComponent(el);
  }

  function captureComponent(el) {
    const computedStyle = getComputedStyle(el);
    const borderRadius = parseFloat(computedStyle.borderRadius) || 0;

    // Save state for restoration after capture
    savedScrollX = window.scrollX;
    savedScrollY = window.scrollY;
    captureTarget = el;

    // Get element's document-relative position before cleanup
    const rect = el.getBoundingClientRect();
    const docX = rect.left + window.scrollX;
    const docY = rect.top + window.scrollY;
    const elWidth = rect.width;
    const elHeight = rect.height;

    cleanup();

    // Force instant scroll (override smooth scroll if page sets it)
    const prevBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";

    // Use visual viewport to handle pinch-to-zoom
    const vv = window.visualViewport;
    const vpWidth = vv ? vv.width : window.innerWidth;
    const vpHeight = vv ? vv.height : window.innerHeight;
    const fitsInViewport = elWidth <= vpWidth && elHeight <= vpHeight;

    // Hide fixed/sticky elements so they don't overlap the capture
    hiddenFixed = hideFixedElements(el);

    if (fitsInViewport) {
      // Scroll element fully into view, then single capture
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const newRect = el.getBoundingClientRect();
          const vvNow = window.visualViewport;
          const vvOffX = vvNow ? vvNow.offsetLeft : 0;
          const vvOffY = vvNow ? vvNow.offsetTop : 0;
          const vvW = vvNow ? vvNow.width : window.innerWidth;
          document.documentElement.style.scrollBehavior = prevBehavior;
          chrome.runtime.sendMessage({
            action: "capture-rect",
            mode: "component",
            rect: { x: newRect.x - vvOffX, y: newRect.y - vvOffY, width: newRect.width, height: newRect.height },
            viewportWidth: vvW,
            borderRadius: borderRadius,
          });
        });
      });
    } else {
      // Element larger than viewport — multi-tile capture via background
      document.documentElement.style.scrollBehavior = prevBehavior;
      chrome.runtime.sendMessage({
        action: "capture-full-component",
        docRect: { x: docX, y: docY, width: elWidth, height: elHeight },
        viewportWidth: vpWidth,
        viewportHeight: vpHeight,
        borderRadius: borderRadius,
      });
    }
  }

  // ─── Fixed/Sticky Element Hiding ──────────────────────────────

  function hideFixedElements(target) {
    const hidden = [];
    for (const el of document.querySelectorAll("*")) {
      if (target.contains(el) || el.contains(target)) continue;
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") {
        hidden.push({ el, prev: el.style.visibility });
        el.style.setProperty("visibility", "hidden", "important");
      }
    }
    return hidden;
  }

  function restoreFixedElements(hidden) {
    for (const { el, prev } of hidden) {
      if (prev) {
        el.style.visibility = prev;
      } else {
        el.style.removeProperty("visibility");
      }
    }
  }

  // ─── Shared ──────────────────────────────────────────────────

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      switchMode();
    }
    if (mode === "component" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "ArrowUp") {
        traverseUp();
      } else {
        traverseDown();
      }
      if (ancestors[ancestorIndex]) {
        const rect = ancestors[ancestorIndex].getBoundingClientRect();
        updateHighlight(ancestors[ancestorIndex], rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    }
  }

  function switchMode() {
    // Tear down current mode UI
    if (overlay) { overlay.remove(); overlay = null; }
    if (selection) { selection.remove(); selection = null; }
    if (highlightEl) { highlightEl.remove(); highlightEl = null; }
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    if (hint) { hint.remove(); hint = null; }
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("mousemove", onComponentMouseMove, true);
    document.removeEventListener("wheel", onComponentWheel, true);
    document.removeEventListener("click", onComponentClick, true);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("scroll", onPageScroll, true);
    document.body.classList.remove("webcap-component-mode");
    isDragging = false;
    currentTarget = null;
    ancestors = [];
    ancestorIndex = 0;

    // Toggle mode
    mode = mode === "rectangle" ? "component" : "rectangle";
    if (mode === "rectangle") {
      startRectangleMode();
    } else {
      startComponentMode();
    }
  }

  function flash() {
    const el = document.createElement("div");
    el.id = "webcap-flash";
    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function cleanup() {
    if (overlay) { overlay.remove(); overlay = null; }
    if (selection) { selection.remove(); selection = null; }
    if (hint) { hint.remove(); hint = null; }
    if (highlightEl) { highlightEl.remove(); highlightEl = null; }
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("mousemove", onComponentMouseMove, true);
    document.removeEventListener("wheel", onComponentWheel, true);
    document.removeEventListener("click", onComponentClick, true);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("scroll", onPageScroll, true);
    document.body.classList.remove("webcap-active", "webcap-component-mode");
    isDragging = false;
    currentTarget = null;
    ancestors = [];
    ancestorIndex = 0;
  }

  // ─── Message Listener ────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "start-capture") {
      init(msg.mode || "rectangle");
    }
    if (msg.action === "prepare-tile") {
      const vv = window.visualViewport;
      const vvOffX = vv ? vv.offsetLeft : 0;
      const vvOffY = vv ? vv.offsetTop : 0;
      const prev = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(msg.x - vvOffX, msg.y - vvOffY);
      document.documentElement.style.scrollBehavior = prev;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          sendResponse({
            scrollX: window.scrollX + vvOffX,
            scrollY: window.scrollY + vvOffY,
          });
        });
      });
      return true;
    }
    if (msg.action === "capture-complete") {
      if (hiddenFixed) {
        restoreFixedElements(hiddenFixed);
        hiddenFixed = null;
      }
      if (captureTarget) {
        window.scrollTo(savedScrollX, savedScrollY);
        captureTarget = null;
      }
      flash();
    }
  });
})();
