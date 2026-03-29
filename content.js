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
        chrome.runtime.sendMessage({
          action: "capture-rect",
          rect: {
            x: Math.round(rect.x * window.devicePixelRatio),
            y: Math.round(rect.y * window.devicePixelRatio),
            width: Math.round(rect.width * window.devicePixelRatio),
            height: Math.round(rect.height * window.devicePixelRatio),
          },
        });
      });
    });
  }

  // ─── Component Mode ──────────────────────────────────────────

  function startComponentMode() {
    hint = document.createElement("div");
    hint.id = "webcap-hint";
    hint.textContent = "Hover to detect · Scroll to traverse · Click to capture · Tab for rectangle mode · Esc to cancel";
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

  function onComponentWheel(e) {
    if (!ancestors.length) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.deltaY < 0) {
      ancestorIndex = Math.min(ancestorIndex + 1, ancestors.length - 1);
    } else {
      ancestorIndex = Math.max(ancestorIndex - 1, 0);
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
    // Get element's bounding rect before removing UI
    const rect = el.getBoundingClientRect();

    // Remove all webcap UI, wait for repaint, then use captureVisibleTab
    // (same pixel-perfect pipeline as rectangle mode)
    cleanup();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chrome.runtime.sendMessage({
          action: "capture-rect",
          rect: {
            x: Math.round(rect.x * window.devicePixelRatio),
            y: Math.round(rect.y * window.devicePixelRatio),
            width: Math.round(rect.width * window.devicePixelRatio),
            height: Math.round(rect.height * window.devicePixelRatio),
          },
        });
      });
    });
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
    document.body.classList.remove("webcap-active");
    isDragging = false;
    currentTarget = null;
    ancestors = [];
    ancestorIndex = 0;
  }

  // ─── Message Listener ────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "start-capture") {
      init(msg.mode || "rectangle");
    }
    if (msg.action === "capture-complete") {
      flash();
    }
  });
})();
