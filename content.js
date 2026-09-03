const CORNER_BADGE_ID = "vox-corner-badge";
const BADGE_CSS = `
  #${CORNER_BADGE_ID} {
    position: fixed;
    top: 18px;
    right: 18px;
    z-index: 2147483647;
    display: inline-flex;
    align-items: stretch;
    padding: 0;
    background: transparent;
    border: none;
    font-family: "JetBrains Mono", "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    pointer-events: none;
    animation: vcb-in 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    filter: drop-shadow(0 6px 22px rgba(0, 0, 0, 0.55));
  }
  #${CORNER_BADGE_ID} .vcb-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 9px 7px 9px;
    background: #4ade80;
    color: #06120a;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    border-radius: 5px 0 0 5px;
    position: relative;
  }
  #${CORNER_BADGE_ID} .vcb-status::before {
    content: "";
    display: inline-block;
    width: 6px; height: 6px;
    background: #06120a;
    animation: vcb-blink 1.1s steps(2, end) infinite;
  }
  #${CORNER_BADGE_ID} .vcb-name {
    display: inline-flex;
    align-items: center;
    padding: 7px 11px;
    background: #0b0b0f;
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    border-radius: 0 5px 5px 0;
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-left: none;
    position: relative;
  }
  #${CORNER_BADGE_ID} .vcb-name::before {
    content: ">_";
    color: rgba(74, 222, 128, 0.9);
    margin-right: 6px;
    font-weight: 800;
  }
  @keyframes vcb-blink {
    0%, 50% { opacity: 1; }
    50.01%, 100% { opacity: 0; }
  }
  @keyframes vcb-in {
    from { opacity: 0; transform: translateX(8px); }
    to { opacity: 1; transform: translateX(0); }
  }
`;

let Injected = false;

const urlObserver = new MutationObserver(() => checkAndInject());

let currentSettings = {};

function injectSettingsGlobal(settings) {
  currentSettings = { ...currentSettings, ...settings };
  window.postMessage(
    { source: "page-settings", action: "replace", settings: currentSettings },
    "*",
  );
}

function pushSetting(key, value) {
  currentSettings[key] = value;
  window.postMessage(
    { source: "page-settings", action: "update", key, value },
    "*",
  );
}

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (e.data?.source !== "page-settings-request") return;
  window.postMessage(
    { source: "page-settings", action: "replace", settings: currentSettings },
    "*",
  );
});

function injectMainWorldScript(filename) {
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL(filename);
  s.onload = function () { this.remove(); };
  (document.head || document.documentElement).appendChild(s);
}

function checkAndInject() {
  if (Injected) return;
  chrome.storage.local.get(
    ["injectEnabled", "MetaDataEnabled", "method1Enabled", "method2Enabled"],
    (data) => {
      if (data.injectEnabled === false) return;

      injectSettingsGlobal({
        metaDataEnabled: data.MetaDataEnabled === true,
        method1: data.method1Enabled === true,
        method2: data.method2Enabled === true,
      });

      injectMainWorldScript("inject.js");
      if (
        window.location.href.includes("tiktok.com/tiktokstudio") &&
        window.location.href.includes("/upload")
      ) {
        injectMainWorldScript("tiktok-upload-hijack.js");
      }
      Injected = true;
      urlObserver.disconnect();
    },
  );
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.MetaDataEnabled !== undefined) {
    pushSetting("metaDataEnabled", changes.MetaDataEnabled.newValue === true);
  }
  if (changes.method1Enabled !== undefined) {
    pushSetting("method1", changes.method1Enabled.newValue === true);
  }
  if (changes.method2Enabled !== undefined) {
    pushSetting("method2", changes.method2Enabled.newValue === true);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === "INJECT_VIDEO") {
    const detail = { base64Data: msg.dataUrl, fileName: msg.fileName };
    const onResult = (ev) => {
      try { sendResponse(ev.detail || { ok: true }); } catch (e) {}
      window.removeEventListener("inject:result", onResult);
    };
    window.addEventListener("inject:result", onResult);
    document.dispatchEvent(new CustomEvent("inject-video", { detail }));
    return true;
  }
});

function ensureBadgeStyles() {
  if (document.getElementById("vox-badge-styles")) return;
  const style = document.createElement("style");
  style.id = "vox-badge-styles";
  style.textContent = BADGE_CSS;
  (document.head || document.documentElement).appendChild(style);
}

function mountCornerBadge() {
  if (document.getElementById(CORNER_BADGE_ID)) return;
  ensureBadgeStyles();
  const badge = document.createElement("div");
  badge.id = CORNER_BADGE_ID;
  badge.innerHTML = '<span class="vcb-status">Live</span><span class="vcb-name">voxzymi.cc</span>';
  (document.body || document.documentElement).appendChild(badge);
}

function removeCornerBadge() {
  document.getElementById(CORNER_BADGE_ID)?.remove();
}

function isStudioPage() {
  return /tiktokstudio|\/tiktokstudio\/|\/studio\//i.test(window.location.href);
}

function syncCornerBadge() {
  if (!isStudioPage()) { removeCornerBadge(); return; }
  chrome.storage.local.get("injectEnabled", (data) => {
    if (data.injectEnabled === false) removeCornerBadge();
    else mountCornerBadge();
  });
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.injectEnabled !== undefined) syncCornerBadge();
});

let lastHref = location.href;
new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    syncCornerBadge();
  }
}).observe(document.documentElement, { childList: true, subtree: true });

if (document.body) syncCornerBadge();
else document.addEventListener("DOMContentLoaded", syncCornerBadge);

checkAndInject();
if (document.body) urlObserver.observe(document.body, { childList: true, subtree: true });
