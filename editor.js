// webcap editor — compositing, background picker, effects controls

(async function () {
  const capture = await chrome.runtime.sendMessage({ action: "get-capture" });
  if (!capture || !capture.dataUrl) {
    document.body.innerHTML =
      '<p style="color:#666;font-family:sans-serif;padding:40px">No capture found.</p>';
    return;
  }

  const img = new Image();
  img.src = capture.dataUrl;
  await img.decode();

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  // Sample background color from image corners
  function sampleEdgeColor() {
    const tmp = document.createElement("canvas");
    tmp.width = img.width;
    tmp.height = img.height;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(img, 0, 0);

    const s = 2;
    const corners = [
      tctx.getImageData(s, s, 1, 1).data,
      tctx.getImageData(img.width - 1 - s, s, 1, 1).data,
      tctx.getImageData(s, img.height - 1 - s, 1, 1).data,
      tctx.getImageData(img.width - 1 - s, img.height - 1 - s, 1, 1).data,
    ];

    const r = Math.round(corners.reduce((sum, c) => sum + c[0], 0) / 4);
    const g = Math.round(corners.reduce((sum, c) => sum + c[1], 0) / 4);
    const b = Math.round(corners.reduce((sum, c) => sum + c[2], 0) / 4);
    return `rgb(${r}, ${g}, ${b})`;
  }

  const sampledBg = sampleEdgeColor();

  // State
  let currentMargin = 80;
  let currentPadding = 0;
  let currentRadius = capture.borderRadius || 0;
  let shadowEnabled = true;

  const backgrounds = [
    { name: "Transparent", type: "transparent" },
    { name: "White", type: "solid", color: "#ffffff" },
    { name: "Light gray", type: "solid", color: "#f0f0f0" },
    { name: "Dark gray", type: "solid", color: "#1e1e1e" },
    { name: "Black", type: "solid", color: "#000000" },
    null,
    { name: "Sunset", type: "gradient", stops: [[0, "#ff6b6b"], [1, "#ffa07a"]] },
    { name: "Ocean", type: "gradient", stops: [[0, "#667eea"], [1, "#764ba2"]] },
    { name: "Forest", type: "gradient", stops: [[0, "#11998e"], [1, "#38ef7d"]] },
    { name: "Dusk", type: "gradient", stops: [[0, "#2c3e50"], [1, "#3498db"]] },
    { name: "Peach", type: "gradient", stops: [[0, "#ee9ca7"], [1, "#ffdde1"]] },
  ];

  let currentBg = backgrounds[0];

  function render() {
    const margin = currentMargin;
    const inset = currentPadding;
    const cardW = img.width + inset * 2;
    const cardH = img.height + inset * 2;
    const w = cardW + margin * 2;
    const h = cardH + margin * 2;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    // Outer background (user-selected)
    if (currentBg.type === "solid") {
      ctx.fillStyle = currentBg.color;
      ctx.fillRect(0, 0, w, h);
    } else if (currentBg.type === "gradient") {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      currentBg.stops.forEach(([off, col]) => grad.addColorStop(off, col));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // Shadow (on the card)
    if (shadowEnabled && margin > 0) {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 50;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.roundRect(margin, margin, cardW, cardH, currentRadius);
      ctx.fill();
      ctx.restore();
    }

    // Card: clip to rounded rect, fill inset with sampled color, draw image
    ctx.save();
    if (currentRadius > 0) {
      ctx.beginPath();
      ctx.roundRect(margin, margin, cardW, cardH, currentRadius);
      ctx.clip();
    }
    if (inset > 0) {
      ctx.fillStyle = sampledBg;
      ctx.fillRect(margin, margin, cardW, cardH);
    }
    ctx.drawImage(img, margin + inset, margin + inset);
    ctx.restore();
  }

  // ─── Effect Controls ─────────────────────────────────────

  const marginSlider = document.getElementById("margin");
  const paddingSlider = document.getElementById("padding");
  const radiusSlider = document.getElementById("radius");
  const shadowToggle = document.getElementById("shadow");
  const plainBtn = document.getElementById("plain");
  const marginVal = document.getElementById("margin-val");
  const paddingVal = document.getElementById("padding-val");
  const radiusVal = document.getElementById("radius-val");

  marginSlider.value = currentMargin;
  paddingSlider.value = currentPadding;
  radiusSlider.value = currentRadius;
  shadowToggle.checked = shadowEnabled;
  marginVal.textContent = currentMargin;
  paddingVal.textContent = currentPadding;
  radiusVal.textContent = currentRadius;

  marginSlider.addEventListener("input", () => {
    currentMargin = parseInt(marginSlider.value);
    marginVal.textContent = currentMargin;
    render();
  });

  paddingSlider.addEventListener("input", () => {
    currentPadding = parseInt(paddingSlider.value);
    paddingVal.textContent = currentPadding;
    render();
  });

  radiusSlider.addEventListener("input", () => {
    currentRadius = parseInt(radiusSlider.value);
    radiusVal.textContent = currentRadius;
    render();
  });

  shadowToggle.addEventListener("change", () => {
    shadowEnabled = shadowToggle.checked;
    render();
  });

  plainBtn.addEventListener("click", () => {
    currentMargin = 0;
    currentPadding = 0;
    currentRadius = 0;
    shadowEnabled = false;
    marginSlider.value = 0;
    paddingSlider.value = 0;
    radiusSlider.value = 0;
    shadowToggle.checked = false;
    marginVal.textContent = "0";
    paddingVal.textContent = "0";
    radiusVal.textContent = "0";
    render();
  });

  // ─── Background Swatches ─────────────────────────────────

  const optionsEl = document.querySelector(".bg-options");

  backgrounds.forEach((bg, i) => {
    if (bg === null) {
      const sep = document.createElement("div");
      sep.className = "separator";
      optionsEl.appendChild(sep);
      return;
    }

    const swatch = document.createElement("button");
    swatch.className = "swatch" + (i === 0 ? " active" : "");
    swatch.title = bg.name;

    if (bg.type === "transparent") {
      swatch.classList.add("checkerboard");
    } else if (bg.type === "solid") {
      swatch.style.background = bg.color;
      if (bg.color === "#ffffff") swatch.classList.add("solid-white");
      if (bg.color === "#1e1e1e" || bg.color === "#000000") swatch.classList.add("needs-ring");
    } else {
      swatch.style.background = `linear-gradient(135deg, ${bg.stops.map((s) => s[1]).join(", ")})`;
    }

    swatch.addEventListener("click", () => {
      document.querySelectorAll(".swatch, .color-picker").forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      currentBg = bg;
      render();
    });

    optionsEl.appendChild(swatch);
  });

  // Custom color picker
  const picker = document.createElement("input");
  picker.type = "color";
  picker.className = "color-picker";
  picker.value = "#4a90d9";
  picker.title = "Custom color";
  picker.addEventListener("input", () => {
    document.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
    currentBg = { type: "solid", color: picker.value };
    render();
  });
  optionsEl.appendChild(picker);

  // ─── Download ────────────────────────────────────────────

  document.getElementById("download").addEventListener("click", () => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "webcap.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  });

  render();
})();
