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
    });
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

    // Clamp rect to image bounds
    const cropX = Math.max(0, Math.min(rect.x, bitmap.width));
    const cropY = Math.max(0, Math.min(rect.y, bitmap.height));
    const cropW = Math.min(rect.width, bitmap.width - cropX);
    const cropH = Math.min(rect.height, bitmap.height - cropY);

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
      borderRadius: options.borderRadius,
      mode: options.mode,
    };
    chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
    chrome.tabs.sendMessage(tabId, { action: "capture-complete" });
  } catch (err) {
    console.error("webcap: capture failed", err);
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
