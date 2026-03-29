// webcap editor — background picker + save

(async function () {
  const response = await chrome.runtime.sendMessage({ action: "get-capture" });
  if (!response || !response.dataUrl) {
    document.body.innerHTML =
      '<p style="color:#666;font-family:sans-serif;padding:40px">No capture found.</p>';
    return;
  }

  const img = new Image();
  img.src = response.dataUrl;
  await img.decode();

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = img.width;
  canvas.height = img.height;

  const backgrounds = [
    { name: "Transparent", type: "transparent" },
    { name: "White", type: "solid", color: "#ffffff" },
    { name: "Light gray", type: "solid", color: "#f0f0f0" },
    { name: "Dark gray", type: "solid", color: "#1e1e1e" },
    { name: "Black", type: "solid", color: "#000000" },
    null, // separator
    { name: "Sunset", type: "gradient", stops: [[0, "#ff6b6b"], [1, "#ffa07a"]] },
    { name: "Ocean", type: "gradient", stops: [[0, "#667eea"], [1, "#764ba2"]] },
    { name: "Forest", type: "gradient", stops: [[0, "#11998e"], [1, "#38ef7d"]] },
    { name: "Dusk", type: "gradient", stops: [[0, "#2c3e50"], [1, "#3498db"]] },
    { name: "Peach", type: "gradient", stops: [[0, "#ee9ca7"], [1, "#ffdde1"]] },
  ];

  let currentBg = backgrounds[0];

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (currentBg.type === "solid") {
      ctx.fillStyle = currentBg.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (currentBg.type === "gradient") {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      currentBg.stops.forEach(([off, col]) => grad.addColorStop(off, col));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
  }

  // Build swatches
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

  // Download
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
