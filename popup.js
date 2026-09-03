const $ = (id) => document.getElementById(id);

const THEME_KEY = "vx_theme";

function applyTheme(theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  const bg = document.getElementById("__shader_bg__");
  if (bg) bg.style.opacity = theme === "light" ? "0.35" : "1";
}

(function () {
  const stored = (() => {
    try { return localStorage.getItem(THEME_KEY); } catch { return null; }
  })();
  let current = stored === "light" ? "light" : "dark";
  applyTheme(current);
  const btn = document.getElementById("themeBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      current = current === "light" ? "dark" : "light";
      applyTheme(current);
      try { localStorage.setItem(THEME_KEY, current); } catch {}
    });
  }
})();

const uploadZone = $("uploadZone");
const uploadTextEl = $("uploadText");
const fileInput = $("bypassFileInput");
const startBtn = $("startBypassBtn");
const uploadLocked = $("uploadLocked");
const uploadActive = $("uploadActive");

const loadingOverlay = $("loadingOverlay");
const loadPct = $("loadPct");
const loadRingLabel = $("loadRingLabel");
const loadPhase = $("loadPhase");
const loadSub = $("loadSub");
const loadETA = $("loadETA");
const loadBar = $("loadBar");
const ringCanvas = $("ringCanvas");
const ringCtx = ringCanvas.getContext("2d");

const warningOverlay = $("warningOverlay");
const warningDetails = $("warningDetails");
const warningProceedBtn = $("warningProceedBtn");
const warningCancelBtn = $("warningCancelBtn");

const toggle2 = $("topazToggle");
const injectToggle = $("injectToggle");
const method1Toggle = $("method1Toggle");
const method2Toggle = $("method2Toggle");
const rowMethod1 = $("rowMethod1");
const rowMethod2 = $("rowMethod2");
const rowTopaz = $("rowTopaz");

const topazHeader = $("TopazHeader");
const topazChevron = $("topazChevron");
const exportTopazBtn = $("saveTopazImgBtn");

const enhancement1 = $("enhancement");
const interpolation1 = $("interpolation");
const enhancementModel = $("enhancementModel");
const interpolationModel = $("interpolationModel");
const slowMotion = $("slowMotion");
const parameters = $("parameters");
const fixCompression = $("fixCompression");
const improveDetail = $("improveDetail");
const sharpen = $("sharpen");
const reduceNoise = $("reduceNoise");
const dehalo = $("dehalo");
const deblur = $("deblur");
const recoverDetail = $("recoverDetail");

const topazAccordion = $("topazAccordion");
const topazEmpty = $("topazEmpty");

let selectedFile = null;
let isProcessing = false;
let videoWidth = 0, videoHeight = 0;
let videoMetadata = { duration: 0, fps: 0 };
let warningState = {
  required: false,
  size: false,
  resolution: false,
  fps: false,
  message: null,
  canProceed: false,
};
let loadStartTime = 0, loadTimerInterval = null, currentPct = 0;
let topazSettings;

const navBtns = document.querySelectorAll(".nav-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

const TAB_ORDER = ["dl", "settings", "home", "tools", "profile"];
let currentTabId = "home";
let isAnimating = false;

const navIndicator = document.createElement("div");
navIndicator.className = "nav-indicator";
document.querySelector(".bottom-nav").appendChild(navIndicator);

function updateNavIndicator(tabId, instant) {
  const btn = $("nav-" + tabId);
  if (!btn) return;
  const nav = document.querySelector(".bottom-nav");
  const navRect = nav.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const w = btnRect.width * 0.44;
  const l = btnRect.left - navRect.left + (btnRect.width - w) / 2;
  if (instant) {
    navIndicator.style.transition = "none";
    navIndicator.style.width = w + "px";
    navIndicator.style.left = l + "px";
    navIndicator.offsetHeight;
    navIndicator.style.transition = "";
  } else {
    navIndicator.style.width = w + "px";
    navIndicator.style.left = l + "px";
  }
}

const SLIDE_PX = 64;
const SLIDE_DUR = 500;
const ENTER_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const EXIT_EASE = "cubic-bezier(0.55, 0, 1, 0.45)";
const STAGGER_STEP = 40;
const STAGGER_CAP = 6;

function applyTransition(el, props, ease) {
  const keys = Object.keys(props);
  el.style.transition = keys.map((k) => `${k} ${SLIDE_DUR}ms ${ease}`).join(", ");
  keys.forEach((k) => (el.style[k] = props[k]));
}

function clearTransition(el) {
  el.style.transition = "";
  el.style.transform = "";
  el.style.opacity = "";
  el.style.zIndex = "";
}

function switchTab(tabId) {
  if (tabId === currentTabId || isAnimating) return;

  const oldIdx = TAB_ORDER.indexOf(currentTabId);
  const newIdx = TAB_ORDER.indexOf(tabId);
  const dir = newIdx > oldIdx ? 1 : -1;

  const oldPanel = $("tab-" + currentTabId);
  const newPanel = $("tab-" + tabId);
  if (!oldPanel || !newPanel) return;

  isAnimating = true;

  const offset = `translateX(${dir * SLIDE_PX}px)`;
  const offsetOut = `translateX(${dir * -SLIDE_PX}px)`;

  newPanel.style.transition = "none";
  newPanel.style.transform = offset;
  newPanel.style.opacity = "0";
  newPanel.style.zIndex = "1";
  oldPanel.style.zIndex = "2";
  newPanel.style.display = "flex";
  newPanel.classList.add("active");

  staggerChildren(newPanel);
  newPanel.getBoundingClientRect();

  applyTransition(newPanel, { transform: "translateX(0px)", opacity: "1" }, ENTER_EASE);
  applyTransition(oldPanel, { transform: offsetOut, opacity: "0" }, ENTER_EASE);

  navBtns.forEach((b) => b.classList.remove("active"));
  const btn = $("nav-" + tabId);
  if (btn) btn.classList.add("active");
  updateNavIndicator(tabId);

  currentTabId = tabId;

  setTimeout(() => {
    clearTransition(oldPanel);
    clearTransition(newPanel);
    oldPanel.style.display = "none";
    oldPanel.classList.remove("active");
    isAnimating = false;
  }, SLIDE_DUR);
}

function staggerChildren(panel) {
  const children = Array.from(panel.children);
  children.forEach((el, i) => {
    el.classList.remove("stagger-item");
    el.style.animationDelay = "";
    el.offsetHeight;
    el.style.animationDelay = Math.min(i, STAGGER_CAP) * STAGGER_STEP + "ms";
    el.classList.add("stagger-item");
    el.addEventListener("animationend", () => {
      el.classList.remove("stagger-item");
      el.style.animationDelay = "";
    }, { once: true });
  });
}

navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab) switchTab(tab);
  });
});

const openCheckerBtn = $("openCheckerBtn");
if (openCheckerBtn) {
  openCheckerBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("checker.html") });
  });
}


requestAnimationFrame(() => {
  const homePanel = $("tab-home");
  homePanel.classList.add("active");
  homePanel.style.display = "flex";
  navBtns.forEach((b) => b.classList.remove("active"));
  const homeBtn = $("nav-home");
  if (homeBtn) homeBtn.classList.add("active");
  updateNavIndicator("home", true);
  staggerChildren(homePanel);
});

function setUploadZoneVisibility(enabled) {
  if (enabled) {
    uploadLocked.style.display = "none";
    uploadActive.style.display = "flex";
  } else {
    uploadLocked.style.display = "";
    uploadActive.style.display = "none";
  }
}

function showOverlay(phaseLabel) {
  currentPct = 0;
  loadStartTime = Date.now();
  loadingOverlay.classList.remove("hiding");
  loadingOverlay.classList.add("show");
  setPhase(1, phaseLabel || "INITIALIZING", "");
  updateRing(0);
  loadBar.style.width = "0%";
  loadPct.textContent = "0%";
  loadETA.textContent = "—";
  clearInterval(loadTimerInterval);
}

function hideOverlay() {
  loadingOverlay.classList.add("hiding");
  clearInterval(loadTimerInterval);
  setTimeout(() => {
    loadingOverlay.classList.remove("show", "hiding");
  }, 320);
}

function showWarning(message) {
  warningDetails.textContent = message;
  warningOverlay.classList.remove("hiding");
  warningOverlay.classList.add("visible");
}

function hideWarning() {
  warningOverlay.classList.add("hiding");
  setTimeout(() => {
    warningOverlay.classList.remove("visible", "hiding");
  }, 280);
}

function setWarningState(file, width, height, fps) {
  const size = file.size > 40 * 1024 * 1024;
  const resolution = Math.min(width, height) > 2160;
  const frameRate = typeof fps === "number" && fps > 120;
  const messages = [];
  if (size) messages.push("File size is over 40MB");
  if (resolution) messages.push("Resolution is higher than 2K");
  if (frameRate) messages.push("FPS is higher than 120");
  warningState.size = size;
  warningState.resolution = resolution;
  warningState.fps = frameRate;
  warningState.required = size || resolution || frameRate;
  warningState.message = warningState.required
    ? messages.join(". ") + ". Your account may be at risk. Do you want to proceed?"
    : null;
  warningState.canProceed = false;
}

function setProgress(pct, sub) {
  currentPct = Math.min(pct, 100);
  updateRing(currentPct);
  loadBar.style.width = currentPct + "%";
  loadPct.textContent = Math.round(currentPct) + "%";
  if (sub) loadSub.textContent = sub;
}

function setPhase(phase, label, sub) {
  loadPhase.textContent = label;
  if (sub !== undefined) loadSub.textContent = sub;
  loadRingLabel.textContent = ["", "CLOUD", "PATCH", "INJECT"][phase] || "";
}

function updateRing(pct) {
  const cx = 44, cy = 44, r = 38;
  ringCtx.clearRect(0, 0, 88, 88);
  ringCtx.beginPath();
  ringCtx.arc(cx, cy, r, 0, Math.PI * 2);
  ringCtx.strokeStyle = "rgba(255,255,255,0.06)";
  ringCtx.lineWidth = 4;
  ringCtx.stroke();
  if (pct > 0) {
    const s = -Math.PI / 2;
    const e = s + (pct / 100) * Math.PI * 2;
    ringCtx.beginPath();
    ringCtx.arc(cx, cy, r, s, e);
    ringCtx.strokeStyle = "#ffffff";
    ringCtx.lineWidth = 4;
    ringCtx.lineCap = "round";
    ringCtx.stroke();
  }
}

async function initMediaInfo() {
  const factory =
    window.mediaInfoFactory ||
    (window.MediaInfo && window.MediaInfo.mediaInfoFactory) ||
    (typeof MediaInfo === "function" ? MediaInfo : null);
  if (!factory) throw new Error("MediaInfo library failed to initialize.");
  return factory({
    format: "object",
    locateFile: (path) => chrome.runtime.getURL(`libs/${path}`),
  });
}

function buildSlider(container, labelText, min, max, value) {
  const v = value ?? 0;
  const range = max - min;
  const pct = range === 0 ? 0 : Math.round(((v - min) / range) * 100);
  container.replaceChildren();
  const label = document.createElement("label");
  label.textContent = labelText;
  const track = document.createElement("div");
  track.className = "tz-track";
  const fill = document.createElement("div");
  fill.className = "tz-fill";
  fill.style.width = pct + "%";
  track.appendChild(fill);
  const span = document.createElement("span");
  span.className = "tz-slider-val";
  span.textContent = String(v);
  container.append(label, track, span);
}

async function extractTopazMetadata(file) {
  const mi = await initMediaInfo();
  const readChunk = (size, offset) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(new Uint8Array(e.target.result));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file.slice(offset, offset + size));
    });
  try {
    const result = await mi.analyzeData(file.size, readChunk);
    if (!result?.media?.track) throw new Error("Invalid MediaInfo result.");
    for (const track of result.media.track) {
      const vals = [
        track.videoai,
        track.Comment,
        track.comment,
        track.Description,
        track["com.topazlabs.videoai"],
        track.extra?.["com.topazlabs.videoai"],
        track.extra?.Comment,
        track.extra?.comment,
        track.extra?.videoai,
        track.extra?.Description,
      ];
      const match = vals.find(
        (v) =>
          typeof v === "string" &&
          (v.toLowerCase().includes("topaz") ||
            v.toLowerCase().includes("enhanced using")),
      );
      if (match) return match;
    }
    throw new Error("Topaz metadata not found.");
  } finally {
    if (mi) mi.close();
  }
}

function parseTopazSettings(text) {
  const getVal = (label) => {
    const m = text.match(new RegExp(`\\b${label}(?:\\s+at)?\\s+(-?\\d+)`, "i"));
    return m ? parseInt(m[1], 10) : null;
  };
  return {
    interpolation: {
      model: text.match(/Processed\s+using\s+([\w-]+)/i)?.[1] || null,
      fps:
        parseInt(text.match(/to\s+(\d+)\s*fps/i)?.[1], 10) ||
        getVal("framerate changed to") ||
        null,
      slowmo: text.match(/Slowmo\s+(\d+)%/i)?.[1]
        ? text.match(/Slowmo\s+(\d+)%/i)[1] + "%"
        : null,
    },
    enhancement: {
      model: text.match(/Enhanced\s+using\s+([\w-]+)/i)?.[1] || null,
      mode: text.match(/mode:\s*([^;]+)/i)?.[1]?.trim() || null,
      parameters: {
        revert_compression: getVal("revert compression"),
        recover_details: getVal("recover details"),
        sharpen: getVal("sharpen"),
        reduce_noise: getVal("reduce noise"),
        dehalo: getVal("dehalo"),
        anti_alias_deblur: getVal("anti-alias/deblur"),
        recover_original_detail: getVal("recover original detail"),
      },
    },
    resolution: text.match(/resolution\s+to\s+(\d+x\d+)/i)?.[1] || null,
  };
}

async function extractRealFPS(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = e.target.result;
        const view = new DataView(buf);
        const u8 = new Uint8Array(buf);
        const vide = [0x76, 0x69, 0x64, 0x65];
        const stsz = [0x73, 0x74, 0x73, 0x7a];
        let vi = -1;
        for (let i = 0; i < u8.length - 4; i++) {
          if (u8[i] === vide[0] && u8[i + 1] === vide[1] &&
              u8[i + 2] === vide[2] && u8[i + 3] === vide[3]) {
            vi = i;
            break;
          }
        }
        if (vi !== -1) {
          for (let i = vi; i < u8.length - 4; i++) {
            if (u8[i] === stsz[0] && u8[i + 1] === stsz[1] &&
                u8[i + 2] === stsz[2] && u8[i + 3] === stsz[3]) {
              resolve(view.getUint32(i + 12));
              return;
            }
          }
        }
      } catch {}
      resolve(null);
    };
    reader.readAsArrayBuffer(file.slice(0, 157286400));
  });
}

function bufferToDataURL(arrayBuffer) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(new Blob([arrayBuffer], { type: "video/mp4" }));
  });
}

function scrubMetadataString(buffer, searchString) {
  const u8 = new Uint8Array(buffer);
  const searchBytes = new TextEncoder().encode(searchString);
  for (let i = 0; i < u8.length - searchBytes.length; i++) {
    let match = true;
    for (let j = 0; j < searchBytes.length; j++) {
      if (u8[i + j] !== searchBytes[j]) { match = false; break; }
    }
    if (match) for (let j = 0; j < searchBytes.length; j++) u8[i + j] = 0x00;
  }
  return buffer;
}

uploadZone.addEventListener("click", () => {
  if (!isProcessing) fileInput.click();
});

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedFile = file;

  uploadTextEl.textContent =
    file.name.length > 24 ? file.name.slice(0, 21) + "…" : file.name;
  uploadZone.classList.add("has-file");
  uploadZone.classList.remove("processing");
  ["t-res", "t-fps", "t-bitrate", "t-size"].forEach(
    (id) => ($(id).textContent = "…"),
  );

  const totalFrames = await extractRealFPS(file);
  const video = document.createElement("video");
  video.preload = "metadata";

  video.onloadedmetadata = () => {
    videoWidth = video.videoWidth;
    videoHeight = video.videoHeight;
    const sizeMB = (file.size / 1048576).toFixed(1);
    const bitrate = video.duration > 0
      ? ((file.size * 8) / video.duration / 1e6).toFixed(1)
      : 0;
    const fps = totalFrames && video.duration > 0
      ? Math.round(totalFrames / video.duration)
      : "?";
    videoMetadata.duration = video.duration;
    videoMetadata.fps = fps;

    const dres = Math.min(videoWidth, videoHeight);
    $("t-res").textContent =
      dres <= 1080 ? `${dres}p` : `${Math.round((dres / 1080) * 1.5)}K`;
    $("t-res").classList.remove("empty");
    $("t-fps").textContent = `${fps}`;
    $("t-fps").classList.remove("empty");
    $("t-bitrate").textContent = `${bitrate} Mbps`;
    $("t-bitrate").classList.remove("empty");
    $("t-size").textContent = `${sizeMB}MB`;
    $("t-size").classList.remove("empty");

    setWarningState(file, videoWidth, videoHeight, fps);
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.classList.add("ready");

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const isTikTokStudio = tabs[0]?.url?.includes("tiktok.com/tiktokstudio/upload");
        if (isTikTokStudio) {
          startBtn.textContent = "Post it!";
          startBtn.dataset.action = "post";
        } else {
          startBtn.textContent = "Go to TikTok Studio";
          startBtn.dataset.action = "redirect";
        }
      });
    }
  };

  video.src = URL.createObjectURL(file);

  topazAccordion.style.display = "none";
  topazEmpty.style.display = "";
  try {
    const rawMeta = await extractTopazMetadata(file);
    topazSettings = parseTopazSettings(rawMeta);
    if (topazSettings) {
      topazAccordion.style.display = "";
      topazEmpty.style.display = "none";

      if (topazSettings.enhancement.model) {
        enhancementModel.options[enhancementModel.selectedIndex].textContent =
          topazSettings.enhancement.model;
      }
      if (topazSettings.interpolation.model) {
        interpolationModel.options[interpolationModel.selectedIndex].textContent =
          topazSettings.interpolation.model;
      }
      slowMotion.options[slowMotion.selectedIndex].textContent =
        topazSettings.interpolation.slowmo ?? "None";
      parameters.options[parameters.selectedIndex].textContent =
        topazSettings.enhancement.mode ?? "";

      const p = topazSettings.enhancement.parameters;
      buildSlider(fixCompression, "Fix compression", 0, 100, p.revert_compression);
      buildSlider(improveDetail, "Improve detail", 0, 100, p.recover_details);
      buildSlider(sharpen, "Sharpen", 0, 100, p.sharpen);
      buildSlider(reduceNoise, "Reduce noise", 0, 100, p.reduce_noise);
      buildSlider(dehalo, "Dehalo", 0, 100, p.dehalo);
      buildSlider(deblur, "Anti-alias/deblur", -100, 100, p.anti_alias_deblur);
      buildSlider(recoverDetail, "Recover detail", 0, 100, p.recover_original_detail);
      recoverDetail.style.display = p.recover_original_detail == null ? "none" : "";
    }
  } catch (_) {}
});

if (startBtn)
  startBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isTikTokStudio = tab?.url?.includes("tiktok.com/tiktokstudio");

    if (warningState.required && !warningState.canProceed && isTikTokStudio) {
      showWarning(warningState.message);
      return;
    }
    if (!isTikTokStudio || startBtn.dataset.action === "redirect") {
      window.open("https://www.tiktok.com/tiktokstudio/upload", "_blank");
      startBtn.dataset.action = "post";
      return;
    }

    let topaz = false;
    chrome.storage.local.get("MetaDataEnabled", (data) => {
      topaz = data.MetaDataEnabled;
    });

    if (!selectedFile || isProcessing) return;
    isProcessing = true;
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.classList.remove("ready");
    }
    uploadZone.classList.add("processing");
    uploadZone.classList.remove("has-file");
    showOverlay("PATCH");

    try {
      let buffer = await selectedFile.arrayBuffer();
      setPhase(1, "BYPASS PAYLOAD", "Applying elst and tkhd values…");
      setProgress(70, "Payload ready");

      let topazString = null;
      try { topazString = await extractTopazMetadata(selectedFile); } catch (_) {}
      if (topazString && topaz) buffer = scrubMetadataString(buffer, topazString);

      setPhase(2, "BINARY PATCH", "Writing elst payload…");
      setProgress(84, "Patching…");

      const dv = new DataView(buffer);
      const u8 = new Uint8Array(buffer);
      const MOOV = [0x6d, 0x6f, 0x6f, 0x76];
      const TRAK = [0x74, 0x72, 0x61, 0x6b];
      const HDLR = [0x68, 0x64, 0x6c, 0x72];
      const VIDE = [0x76, 0x69, 0x64, 0x65];
      const TKHD = [0x74, 0x6b, 0x68, 0x64];

      function findBox(data, boxType, start = 0) {
        for (let i = start; i <= data.length - 4; i++) {
          if (data[i] === boxType[0] && data[i + 1] === boxType[1] &&
              data[i + 2] === boxType[2] && data[i + 3] === boxType[3]) return i;
        }
        return -1;
      }

      const moov = findBox(u8, MOOV);
      if (moov === -1) throw new Error("Not a valid MP4 (no moov box)");

      let pos = moov, isPatched = false;
      while (true) {
        const trak = findBox(u8, TRAK, pos);
        if (trak === -1) break;
        const next_trak = findBox(u8, TRAK, trak + 4);
        const end = next_trak !== -1 ? next_trak : u8.length;
        const hdlr = findBox(u8, HDLR, trak);
        if (hdlr !== -1 && hdlr < end) {
          if (u8[hdlr + 12] === VIDE[0] && u8[hdlr + 13] === VIDE[1] &&
              u8[hdlr + 14] === VIDE[2] && u8[hdlr + 15] === VIDE[3]) {
            const tkhdPos = findBox(u8, TKHD, trak);
            if (tkhdPos !== -1 && tkhdPos < end && u8[tkhdPos + 4] === 0) {
              dv.setUint32(tkhdPos + 48, 1, false);
              isPatched = true;
            }
            break;
          }
        }
        pos = trak + 4;
      }

      if (!isPatched) throw new Error("Couldn't patch — container layout not recognised");

      setPhase(3, "INJECTING", "Encoding data for transfer…");
      setProgress(90, "ENCODING DATA…");

      const base64Data = await bufferToDataURL(buffer);
      const fileName = selectedFile.name.replace(/\.[^/.]+$/, "") + " - voxzymi.cc.mp4";

      setProgress(93, "FINDING TIKTOK TAB…");

      const tikTokTabs = await chrome.tabs.query({ url: "*://*.tiktok.com/*" });
      let targetTabId = null;

      if (tikTokTabs.length > 0) {
        const uploadTab = tikTokTabs.find(
          (t) => t.url && (t.url.includes("/upload") || t.url.includes("/studio")),
        );
        targetTabId = (uploadTab || tikTokTabs[0]).id;
      } else {
        const newTab = await chrome.tabs.create({
          url: "https://www.tiktok.com/upload",
          active: false,
        });
        targetTabId = newTab.id;
        await new Promise((resolve) => {
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === newTab.id && info.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(resolve, 2500);
            }
          });
        });
      }

      setProgress(96, "UPLOADING TO TIKTOK…");
      const result = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          targetTabId,
          { action: "INJECT_VIDEO", dataUrl: base64Data, fileName },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(response || { ok: true });
            }
          },
        );
      });
      if (!result?.ok)
        throw new Error(result?.error || "Injection failed — open tiktok.com/upload first");

      chrome.tabs.update(targetTabId, { active: true });
      setProgress(100, "DONE!");

      setTimeout(() => {
        hideOverlay();
        if (startBtn) startBtn.classList.add("success-mode");
        if (startBtn) startBtn.textContent = "✓ INJECTED";
        uploadZone.classList.remove("processing");
        $("topbarBadge").textContent = "INJECTED";
        setTimeout(resetUI, 4000);
      }, 1000);
    } catch (err) {
      hideOverlay();
      if (startBtn) {
        startBtn.textContent = "RETRY";
        startBtn.classList.add("ready");
        startBtn.disabled = false;
      }
      uploadZone.classList.remove("processing");
      uploadZone.classList.add("has-file");
      isProcessing = false;
      console.error(err);
    }
  });

function resetUI() {
  if (startBtn) {
    startBtn.classList.remove("success-mode", "ready");
    startBtn.textContent = "Post it!";
    delete startBtn.dataset.action;
    startBtn.disabled = true;
  }
  selectedFile = null;
  isProcessing = false;
  fileInput.value = "";
  uploadZone.classList.remove("has-file", "processing");
  uploadTextEl.textContent = "SELECT FILE";
  ["t-res", "t-fps", "t-bitrate", "t-size"].forEach((id) => {
    const el = $(id);
    if (el) { el.textContent = "—"; el.classList.add("empty"); }
  });
  $("topbarBadge").textContent = "READY";
}

warningProceedBtn.addEventListener("click", () => {
  warningState.canProceed = true;
  hideWarning();
  if (startBtn) startBtn.click();
});

warningCancelBtn.addEventListener("click", hideWarning);

function setMethodRowsLocked(masterEnabled) {
  [rowMethod1, rowMethod2, rowTopaz].forEach((row) => {
    if (row) row.classList.toggle("row-locked", !masterEnabled);
  });
  [method1Toggle, method2Toggle, toggle2].forEach((el) => {
    if (el) el.disabled = !masterEnabled;
  });
  syncMethod2Lock();
}

function syncMethod2Lock() {
  if (!method1Toggle || !method2Toggle || !rowMethod2) return;
  const masterOn = injectToggle && injectToggle.checked;
  const decoyOn = method1Toggle.checked;
  const gated = !decoyOn;
  if (gated && method2Toggle.checked) {
    method2Toggle.checked = false;
    chrome.storage.local.set({ method2Enabled: false });
  }
  rowMethod2.classList.toggle("row-locked", !masterOn || gated);
  method2Toggle.disabled = !masterOn || gated;
}

chrome.storage.local.get("MetaDataEnabled", (data) => {
  if (data.MetaDataEnabled) toggle2.checked = data.MetaDataEnabled;
});

toggle2.addEventListener("change", () => {
  chrome.storage.local.set({ MetaDataEnabled: toggle2.checked });
});

chrome.storage.local.get(
  ["injectEnabled", "method1Enabled", "method2Enabled"],
  (data) => {
    const isEnabled = data.injectEnabled !== false;
    injectToggle.checked = isEnabled;
    setUploadZoneVisibility(isEnabled);
    if (method1Toggle) method1Toggle.checked = data.method1Enabled === true;
    if (method2Toggle) method2Toggle.checked = data.method2Enabled === true;
    setMethodRowsLocked(isEnabled);
  },
);

if (method1Toggle) {
  method1Toggle.addEventListener("change", () => {
    chrome.storage.local.set({ method1Enabled: method1Toggle.checked });
    syncMethod2Lock();
  });
}

if (method2Toggle) {
  method2Toggle.addEventListener("change", () => {
    chrome.storage.local.set({ method2Enabled: method2Toggle.checked });
  });
}

injectToggle.addEventListener("change", async () => {
  const isEnabled = injectToggle.checked;
  chrome.storage.local.set({ injectEnabled: isEnabled });
  setUploadZoneVisibility(isEnabled);
  setMethodRowsLocked(isEnabled);

  if (!isEnabled) {
    selectedFile = null;
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.classList.remove("ready", "success-mode");
      startBtn.textContent = "Post it!";
    }
    uploadZone.classList.remove("has-file", "processing");
    uploadTextEl.textContent = "SELECT FILE";
    ["t-res", "t-fps", "t-bitrate", "t-size"].forEach((id) => {
      const el = $(id);
      if (el) { el.textContent = "—"; el.classList.add("empty"); }
    });
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.includes("tiktok.com/tiktokstudio")) chrome.tabs.reload(tab.id);
});

let topazOpen = false;
enhancement1.style.display = "none";

topazHeader.addEventListener("click", () => {
  topazOpen = !topazOpen;
  topazAccordion.classList.toggle("active", topazOpen);
  exportTopazBtn.style.display = topazOpen ? "flex" : "none";
  enhancement1.style.display = topazOpen ? "" : "none";
});

document.querySelectorAll(".tz-sub-header").forEach((header) => {
  header.addEventListener("click", () => {
    header.closest(".tz-sub-accordion").classList.toggle("active");
  });
});

exportTopazBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!topazSettings) return;

  const W = 560, GRID = 28, PAD = 36, COL_VAL = 320;
  const BG = "#080808",
    BORDER = "rgba(255,255,255,0.08)",
    BORDER_ACC = "rgba(255,255,255,0.28)";
  const TEXT = "#e8e8e8", MUTED = "#484848", WHITE = "#ffffff";
  const MONO = "'Space Mono', monospace", SANS = "'DM Sans', sans-serif";

  function collectRows(s) {
    const rows = [];
    const addSection = (title, obj) => {
      rows.push({ type: "section", title });
      for (const [k, v] of Object.entries(obj)) {
        if (v == null) continue;
        if (typeof v === "object") {
          for (const [sk, sv] of Object.entries(v)) {
            if (sv == null) continue;
            rows.push({
              type: "row",
              label: sk.replace(/_/g, " ").toUpperCase(),
              value: String(sv),
            });
          }
        } else rows.push({
          type: "row",
          label: k.replace(/_/g, " ").toUpperCase(),
          value: String(v),
        });
      }
      rows.push({ type: "gap" });
    };
    if (s.enhancement) addSection("Enhancement", s.enhancement);
    if (s.interpolation) addSection("Interpolation", s.interpolation);
    if (s.resolution) rows.push({ type: "row", label: "RESOLUTION", value: s.resolution });
    return rows;
  }

  const rows = collectRows(topazSettings);
  const HEADER_H = 52 + 72 + 16, SECTION_H = 26, ROW_H = 32, GAP_H = 14, FOOTER_H = 48;
  let contentH = 0;
  for (const r of rows) {
    if (r.type === "section") contentH += SECTION_H + 8;
    else if (r.type === "row") contentH += ROW_H;
    else if (r.type === "gap") contentH += GAP_H;
  }
  const H = HEADER_H + contentH + FOOTER_H + PAD;
  const canvas = document.createElement("canvas"), DPR = 2;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext("2d");
  ctx.scale(DPR, DPR);

  function roundRect(cx, x, y, w, h, r) {
    cx.beginPath();
    cx.moveTo(x + r, y);
    cx.lineTo(x + w - r, y);
    cx.quadraticCurveTo(x + w, y, x + w, y + r);
    cx.lineTo(x + w, y + h - r);
    cx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    cx.lineTo(x + r, y + h);
    cx.quadraticCurveTo(x, y + h, x, y + h - r);
    cx.lineTo(x, y + r);
    cx.quadraticCurveTo(x, y, x + r, y);
    cx.closePath();
  }

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.022)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += GRID) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += GRID) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(8,8,8,0.55)";
  ctx.fillRect(0, 0, W, 52);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 52); ctx.lineTo(W, 52); ctx.stroke();
  roundRect(ctx, 14, 10, 32, 32, 7);
  ctx.fillStyle = "#191919"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1; ctx.stroke();
  ctx.save();
  ctx.translate(20, 16);
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 2;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(3, 4); ctx.lineTo(10, 16); ctx.lineTo(17, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(10, 10, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = WHITE; ctx.fill();
  ctx.restore();
  ctx.fillStyle = TEXT;
  ctx.font = `bold 12px ${MONO}`;
  ctx.letterSpacing = "0.1em";
  ctx.fillText("voxzymi.cc", 56, 29);
  ctx.fillStyle = MUTED;
  ctx.font = `8px ${MONO}`;
  ctx.fillText("v0.5.0", 56, 42);
  ctx.letterSpacing = "0px";

  let y = 52 + 26;
  ctx.save();
  const shimmer = ctx.createLinearGradient(PAD, 0, PAD + 220, 0);
  shimmer.addColorStop(0, MUTED);
  shimmer.addColorStop(0.5, TEXT);
  shimmer.addColorStop(1, MUTED);
  ctx.fillStyle = shimmer;
  ctx.font = `bold 9px ${MONO}`;
  ctx.fillText("TOPAZ VIDEO AI SETTINGS", PAD, y);
  ctx.restore();
  y += 22;
  ctx.fillStyle = WHITE;
  ctx.font = `bold 20px ${MONO}`;
  ctx.fillText("Settings Export", PAD, y);
  y += 18;
  ctx.fillStyle = MUTED;
  ctx.font = `11px ${SANS}`;
  ctx.fillText("Exported via voxzymi.cc", PAD, y);
  y += 28;
  ctx.strokeStyle = BORDER_ACC;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 20;

  for (const row of rows) {
    if (row.type === "section") {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundRect(ctx, PAD, y - 14, 140, 20, 4);
      ctx.fill();
      ctx.strokeStyle = BORDER; ctx.lineWidth = 1;
      roundRect(ctx, PAD, y - 14, 140, 20, 4);
      ctx.stroke();
      ctx.fillStyle = TEXT;
      ctx.font = `bold 10px ${MONO}`;
      ctx.letterSpacing = "0.1em";
      ctx.fillText(row.title.toUpperCase(), PAD + 10, y);
      ctx.letterSpacing = "0px";
      y += SECTION_H + 8;
    } else if (row.type === "row") {
      if (rows.indexOf(row) % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.018)";
        ctx.fillRect(PAD - 8, y - 14, W - (PAD - 8) * 2, ROW_H - 2);
      }
      ctx.fillStyle = MUTED;
      ctx.font = `11px ${MONO}`;
      ctx.fillText(row.label + ":", PAD, y);
      const numVal = parseFloat(row.value),
        isHi = !isNaN(numVal) && numVal !== 0;
      ctx.fillStyle = isHi ? WHITE : TEXT;
      ctx.font = isHi ? `bold 12px ${MONO}` : `12px ${MONO}`;
      ctx.fillText(row.value, COL_VAL, y);
      ctx.strokeStyle = BORDER; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD, y + 10); ctx.lineTo(W - PAD, y + 10); ctx.stroke();
      y += ROW_H;
    } else if (row.type === "gap") {
      y += GAP_H;
    }
  }

  y = H - FOOTER_H;
  ctx.strokeStyle = BORDER; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.font = `9px ${MONO}`;
  ctx.letterSpacing = "0.08em";
  ctx.fillText("voxzymi.cc", PAD, y + 22);
  ctx.textAlign = "right";
  ctx.fillText(new Date().toISOString().slice(0, 10), W - PAD, y + 22);
  ctx.textAlign = "left";
  ctx.letterSpacing = "0px";
  ctx.strokeStyle = BORDER_ACC; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  const a = document.createElement("a");
  a.download = "Topaz Settings - exported using voxzymi.cc.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
});

const dlInput = $("dlInput");
const dlBtn = $("dlBtn");

if (dlInput && dlBtn) {
  dlInput.addEventListener("input", () => {
    const v = dlInput.value.trim();
    dlBtn.classList.toggle("ready", v.includes("tiktok.com"));
  });
}

async function doPopupDownload(videoUrl) {
  const submitRes = await fetch("https://www.tikwm.com/api/video/task/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json",
    },
    body: new URLSearchParams({ url: videoUrl, web: 1 }),
  });
  if (!submitRes.ok) throw new Error(`Submit failed (${submitRes.status})`);
  const submitData = await submitRes.json();
  if (submitData.code !== 0 || !submitData.data?.task_id)
    throw new Error("API error: " + (submitData.msg || "no task ID returned"));

  const taskId = submitData.data.task_id;
  let downloadUrl = null;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    dlBtn.textContent = `Polling… (${i + 1}/12)`;
    const resultRes = await fetch(
      `https://www.tikwm.com/api/video/task/result?task_id=${taskId}`,
      { headers: { Accept: "application/json" } },
    );
    const resultData = await resultRes.json();
    if (resultData.code === 0 && resultData.data?.status === 2) {
      downloadUrl = resultData.data.detail.download_url;
      break;
    }
  }
  if (!downloadUrl) throw new Error("Timed out — download URL not ready");

  chrome.downloads.download({ url: downloadUrl });
}

if (dlBtn && dlInput) {
  dlBtn.addEventListener("click", async () => {
    const url = dlInput.value.trim();
    if (!url.includes("tiktok.com")) return;
    dlBtn.textContent = "Submitting…";
    dlBtn.classList.remove("ready");
    try {
      await doPopupDownload(url);
      dlBtn.textContent = "Download started ✓";
      setTimeout(() => {
        dlBtn.textContent = "Paste & Download";
        dlBtn.classList.toggle("ready", dlInput.value.trim().includes("tiktok.com"));
      }, 3000);
    } catch (err) {
      dlBtn.textContent = "Error — Retry";
      dlBtn.classList.add("ready");
      setTimeout(() => { dlBtn.textContent = "Paste & Download"; }, 3000);
    }
  });
}
