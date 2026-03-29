// webcap background service worker

chrome.action.onClicked.addListener(async (tab) => {
  await injectAndStart(tab.id, "rectangle");
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
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "capture-rect" && sender.tab) {
    captureAndCrop(sender.tab.id, msg.rect);
  }
  if (msg.action === "open-dataurl") {
    chrome.tabs.create({ url: msg.dataUrl });
  }
});

async function captureAndCrop(tabId, rect) {
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

    const canvas = new OffscreenCanvas(cropW, cropH);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
    const arrayBuffer = await croppedBlob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const croppedDataUrl = "data:image/png;base64," + base64;

    chrome.tabs.create({ url: croppedDataUrl });
    // Notify content script that capture is done so it can show the flash
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
