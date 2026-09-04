const VOX_DL_ATTR = "data-vox-dl";
const VOX_DL_STYLE_ID = "vox-dl-styles";

const VOX_DL_CSS = `
  .vox-dl-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2147483000;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: rgba(11, 11, 15, 0.72);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    font-family: "Space Mono", ui-monospace, monospace;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    backdrop-filter: blur(10px) saturate(160%);
    -webkit-backdrop-filter: blur(10px) saturate(160%);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity .18s ease, transform .18s ease, background .18s ease, border-color .18s ease, color .18s ease;
    pointer-events: auto;
  }
  .vox-dl-host:hover .vox-dl-btn,
  .vox-dl-btn:focus,
  .vox-dl-btn.vox-dl-busy,
  .vox-dl-btn.vox-dl-ok,
  .vox-dl-btn.vox-dl-err {
    opacity: 1;
    transform: translateY(0);
  }
  .vox-dl-btn:hover {
    background: rgba(30, 30, 38, 0.9);
    border-color: rgba(255, 255, 255, 0.55);
  }
  .vox-dl-btn.vox-dl-busy {
    color: #f5c451;
    border-color: rgba(245, 196, 81, 0.6);
  }
  .vox-dl-btn.vox-dl-ok {
    color: #4ade80;
    border-color: rgba(74, 222, 128, 0.75);
    box-shadow: 0 0 0 0.5px rgba(74, 222, 128, 0.45), 0 4px 18px rgba(0, 0, 0, 0.5);
  }
  .vox-dl-btn.vox-dl-err {
    color: #ff5c7a;
    border-color: rgba(255, 92, 122, 0.75);
    box-shadow: 0 0 0 0.5px rgba(255, 92, 122, 0.45), 0 4px 18px rgba(0, 0, 0, 0.5);
  }
  .vox-dl-btn svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .vox-dl-btn.vox-dl-busy svg {
    animation: vox-dl-spin 0.9s linear infinite;
  }
  @keyframes vox-dl-spin {
    to { transform: rotate(360deg); }
  }
`;

const VOX_DL_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3v13"/><path d="M7 11l5 5 5-5"/><path d="M4 21h16"/></svg>';
const VOX_DL_SPIN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>';
const VOX_DL_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>';
const VOX_DL_CROSS = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';

function ensureDLStyles() {
  if (document.getElementById(VOX_DL_STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = VOX_DL_STYLE_ID;
  s.textContent = VOX_DL_CSS;
  (document.head || document.documentElement).appendChild(s);
}

function extractVideoUrl(anchor) {
  const href = anchor.getAttribute("href") || anchor.href || "";
  const m = href.match(/\/@([^/?#]+)\/video\/(\d+)/);
  if (!m) return null;
  return `https://www.tiktok.com/@${m[1]}/video/${m[2]}`;
}

function findHostContainer(anchor) {
  const specific =
    anchor.closest('[data-e2e="feed-video"]') ||
    anchor.closest('[data-e2e="recommend-list-item-container"]') ||
    anchor.closest('[data-e2e="user-post-item"]') ||
    anchor.closest('[data-e2e="user-post-item-list"] > div') ||
    anchor.closest('[data-e2e="browse-video"]') ||
    anchor.closest("article");
  if (specific) return specific;
  return anchor;
}

function requestNativeDownload(videoUrl) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: "RESOLVE_TIKTOK_VIDEO", videoUrl },
      (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!res) { reject(new Error("no response")); return; }
        if (res.ok) resolve(res.info);
        else reject(new Error(res.error || "unknown"));
      },
    );
  });
}

function setBtnState(btn, state) {
  btn.classList.remove("vox-dl-busy", "vox-dl-ok", "vox-dl-err");
  if (state === "idle") btn.innerHTML = VOX_DL_ICON;
  else if (state === "busy") { btn.innerHTML = VOX_DL_SPIN; btn.classList.add("vox-dl-busy"); }
  else if (state === "ok") { btn.innerHTML = VOX_DL_CHECK; btn.classList.add("vox-dl-ok"); }
  else if (state === "err") { btn.innerHTML = VOX_DL_CROSS; btn.classList.add("vox-dl-err"); }
}

async function handleDownload(videoUrl, btn) {
  if (btn.dataset.busy === "1") return;
  btn.dataset.busy = "1";
  setBtnState(btn, "busy");
  try {
    const info = await requestNativeDownload(videoUrl);
    setBtnState(btn, "ok");
    if (info?.width && info?.height && info?.bitrate) {
      const mbps = (info.bitrate / 1e6).toFixed(1);
      btn.title = `Downloaded ${info.width}×${info.height} · ${mbps} Mbps`;
    }
  } catch (err) {
    console.warn("[vox] download failed:", err);
    setBtnState(btn, "err");
    btn.title = "Download failed: " + err.message;
  } finally {
    setTimeout(() => {
      btn.dataset.busy = "0";
      setBtnState(btn, "idle");
      btn.title = "Download video";
    }, 2500);
  }
}

function attachDownloadButton(anchor) {
  if (anchor.hasAttribute(VOX_DL_ATTR)) return;
  const videoUrl = extractVideoUrl(anchor);
  if (!videoUrl) return;
  anchor.setAttribute(VOX_DL_ATTR, "1");

  const host = findHostContainer(anchor);
  const computed = getComputedStyle(host);
  if (computed.position === "static") host.style.position = "relative";
  host.classList.add("vox-dl-host");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "vox-dl-btn";
  btn.title = "Download video";
  btn.setAttribute("aria-label", "Download video");
  setBtnState(btn, "idle");
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDownload(videoUrl, btn);
  });
  btn.addEventListener("mousedown", (e) => e.stopPropagation());

  host.appendChild(btn);
}

function scanForVideoLinks(root = document) {
  const anchors = root.querySelectorAll('a[href*="/video/"]');
  for (const a of anchors) attachDownloadButton(a);
}

let scanQueued = false;
function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => {
    scanQueued = false;
    scanForVideoLinks();
  });
}

const dlObserver = new MutationObserver(queueScan);
let downloaderRunning = false;

function startDownloader() {
  if (downloaderRunning) return;
  downloaderRunning = true;
  ensureDLStyles();
  scanForVideoLinks();
  dlObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function stopDownloader() {
  if (!downloaderRunning) return;
  downloaderRunning = false;
  dlObserver.disconnect();
  document.querySelectorAll(".vox-dl-btn").forEach((b) => b.remove());
  document.querySelectorAll("[" + VOX_DL_ATTR + "]").forEach((a) => a.removeAttribute(VOX_DL_ATTR));
  document.querySelectorAll(".vox-dl-host").forEach((h) => h.classList.remove("vox-dl-host"));
}

function applyDownloaderPref(enabled) {
  if (enabled) startDownloader();
  else stopDownloader();
}

function initDownloader() {
  chrome.storage.local.get("downloaderEnabled", (data) => {
    applyDownloaderPref(data.downloaderEnabled !== false);
  });
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.downloaderEnabled !== undefined) {
    applyDownloaderPref(changes.downloaderEnabled.newValue !== false);
  }
});

if (document.body) initDownloader();
else document.addEventListener("DOMContentLoaded", initDownloader);
