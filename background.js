// webcap background service worker

let pendingCapture = null;

chrome.action.onClicked.addListener(async (tab) => {
  await injectAndStart(tab.id, "component");
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === "capture-rectangle") {
    await injectAndStart(tab.id, "rectangle");
  } else if (command === "capture-component") {
    await injectAndStart(tab.id, "component");
  }
});

async function injectAndStart(tabId, mode) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content.css"],
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });

    await chrome.tabs.sendMessage(tabId, { action: "start-capture", mode });
  } catch (err) {
    console.error("webcap: failed to inject", err);
  }
}

// Listen for capture requests from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "capture-rect" && sender.tab) {
    captureAndCrop(sender.tab.id, msg.rect, {
      borderRadius: msg.borderRadius || 0,
      mode: msg.mode || "rectangle",
      viewportWidth: msg.viewportWidth,
    });
  }
  if (msg.action === "capture-full-component" && sender.tab) {
    captureFullComponent(sender.tab.id, msg);
  }
  if (msg.action === "get-capture") {
    sendResponse(pendingCapture);
    pendingCapture = null;
  }
});

async function captureAndCrop(tabId, rect, options = {}) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: "png",
    });

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    // Derive scale from actual image dimensions (handles zoom correctly)
    const scale = options.viewportWidth ? bitmap.width / options.viewportWidth : 1;

    const cropX = Math.max(0, Math.min(Math.round(rect.x * scale), bitmap.width));
    const cropY = Math.max(0, Math.min(Math.round(rect.y * scale), bitmap.height));
    const cropW = Math.min(Math.round(rect.width * scale), bitmap.width - cropX);
    const cropH = Math.min(Math.round(rect.height * scale), bitmap.height - cropY);

    if (cropW <= 0 || cropH <= 0) {
      console.error("webcap: invalid crop dimensions");
      return;
    }

    const cropCanvas = new OffscreenCanvas(cropW, cropH);
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const finalBlob = await cropCanvas.convertToBlob({ type: "image/png" });
    const arrayBuffer = await finalBlob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const croppedDataUrl = "data:image/png;base64," + base64;

    pendingCapture = {
      dataUrl: croppedDataUrl,
      borderRadius: Math.round((options.borderRadius || 0) * scale),
      mode: options.mode,
    };
    chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
    chrome.tabs.sendMessage(tabId, { action: "capture-complete" });
  } catch (err) {
    console.error("webcap: capture failed", err);
  }
}

async function captureFullComponent(tabId, data) {
  try {
    const { docRect, viewportWidth, viewportHeight, borderRadius } = data;

    let canvas = null;
    let ctx = null;
    let scale = 0;

    let isFirstTile = true;
    for (let tileY = 0; tileY < docRect.height; tileY += viewportHeight) {
      for (let tileX = 0; tileX < docRect.width; tileX += viewportWidth) {
        // Throttle to stay under Chrome's 2 calls/sec captureVisibleTab limit
        if (!isFirstTile) {
          await new Promise((r) => setTimeout(r, 550));
        }
        isFirstTile = false;

        // Ask content script to scroll to this tile
        const result = await new Promise((resolve) => {
          chrome.tabs.sendMessage(
            tabId,
            { action: "prepare-tile", x: docRect.x + tileX, y: docRect.y + tileY },
            resolve
          );
        });

        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);

        // Derive scale from first tile (handles zoom correctly)
        if (!canvas) {
          scale = bitmap.width / viewportWidth;
          canvas = new OffscreenCanvas(
            Math.round(docRect.width * scale),
            Math.round(docRect.height * scale)
          );
          ctx = canvas.getContext("2d");
        }

        // Where the element sits in this viewport after scroll
        const elVpX = docRect.x - result.scrollX;
        const elVpY = docRect.y - result.scrollY;

        // Visible portion of element (CSS pixels)
        const visLeft = Math.max(0, elVpX);
        const visTop = Math.max(0, elVpY);
        const visRight = Math.min(viewportWidth, elVpX + docRect.width);
        const visBottom = Math.min(viewportHeight, elVpY + docRect.height);

        if (visRight <= visLeft || visBottom <= visTop) {
          bitmap.close();
          continue;
        }

        // Source rect in captured image (device pixels)
        const srcX = Math.round(visLeft * scale);
        const srcY = Math.round(visTop * scale);
        const srcW = Math.round((visRight - visLeft) * scale);
        const srcH = Math.round((visBottom - visTop) * scale);

        // Destination in final stitched canvas (device pixels)
        const destX = Math.round((visLeft - elVpX) * scale);
        const destY = Math.round((visTop - elVpY) * scale);

        ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, destX, destY, srcW, srcH);
        bitmap.close();
      }
    }

    const finalBlob = await canvas.convertToBlob({ type: "image/png" });
    const arrayBuffer = await finalBlob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    pendingCapture = {
      dataUrl: "data:image/png;base64," + base64,
      borderRadius: Math.round(borderRadius * scale),
      mode: "component",
    };

    chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
    chrome.tabs.sendMessage(tabId, { action: "capture-complete" });
  } catch (err) {
    console.error("webcap: full component capture failed", err);
    chrome.tabs.sendMessage(tabId, { action: "capture-complete" });
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
}
