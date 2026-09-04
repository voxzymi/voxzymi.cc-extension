const CORNER_BADGE_ID = "vox-corner-badge";
const NOTIF_STACK_ID = "vox-corner-notifs";
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
  #${NOTIF_STACK_ID} {
    position: fixed;
    top: 58px;
    right: 18px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    pointer-events: none;
    font-family: "JetBrains Mono", "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  #${NOTIF_STACK_ID} .vcb-notif {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(11, 11, 15, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #e6e6e6;
    text-transform: uppercase;
    filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.5));
    animation: vcb-notif-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
    white-space: nowrap;
  }
  #${NOTIF_STACK_ID} .vcb-notif.leaving {
    animation: vcb-notif-out 0.35s ease-in both;
  }
  #${NOTIF_STACK_ID} .vcb-notif .dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #4ade80;
    box-shadow: 0 0 6px rgba(74, 222, 128, 0.7);
  }
  #${NOTIF_STACK_ID} .vcb-notif.off .dot {
    background: #ff5c7a;
    box-shadow: 0 0 6px rgba(255, 92, 122, 0.7);
  }
  #${NOTIF_STACK_ID} .vcb-notif .state {
    color: #4ade80;
    font-weight: 800;
  }
  #${NOTIF_STACK_ID} .vcb-notif.off .state {
    color: #ff5c7a;
  }
  @keyframes vcb-notif-in {
    from { opacity: 0; transform: translateX(14px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes vcb-notif-out {
    from { opacity: 1; transform: translateX(0); max-height: 32px; margin-top: 0; padding-top: 6px; padding-bottom: 6px; }
    to   { opacity: 0; transform: translateX(14px); max-height: 0; margin-top: -6px; padding-top: 0; padding-bottom: 0; }
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
    ["injectEnabled", "MetaDataEnabled", "method1Enabled", "method2Enabled", "method3Enabled"],
    (data) => {
      injectSettingsGlobal({
        injectEnabled: data.injectEnabled !== false,
        metaDataEnabled: data.MetaDataEnabled === true,
        method1: data.method1Enabled === true,
        method2: data.method2Enabled === true,
        method3: data.method3Enabled === true,
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

const SETTING_LABELS = {
  injectEnabled: "Upload Enhancer",
  MetaDataEnabled: "Topaz Remove",
  method1Enabled: "1080p60",
  method2Enabled: "FPS Method",
  method3Enabled: "1080p60 Forced",
};

function showBadgeNotif(label, on) {
  const stack = document.getElementById(NOTIF_STACK_ID);
  if (!stack) return;
  const notif = document.createElement("div");
  notif.className = "vcb-notif" + (on ? "" : " off");
  notif.innerHTML =
    '<span class="dot"></span>' +
    '<span>' + label + '</span>' +
    '<span class="state">' + (on ? "ON" : "OFF") + '</span>';
  stack.appendChild(notif);
  setTimeout(() => {
    notif.classList.add("leaving");
    notif.addEventListener("animationend", () => notif.remove(), { once: true });
  }, 2200);
}

function ensureBadgeStyles() {
  if (document.getElementById("vox-badge-styles")) return;
  const style = document.createElement("style");
  style.id = "vox-badge-styles";
  style.textContent = BADGE_CSS;
  (document.head || document.documentElement).appendChild(style);
}

function mountCornerBadge() {
  ensureBadgeStyles();
  if (!document.getElementById(CORNER_BADGE_ID)) {
    const badge = document.createElement("div");
    badge.id = CORNER_BADGE_ID;
    badge.innerHTML = '<span class="vcb-status">Live</span><span class="vcb-name">voxzymi.cc</span>';
    (document.body || document.documentElement).appendChild(badge);
  }
  if (!document.getElementById(NOTIF_STACK_ID)) {
    const stack = document.createElement("div");
    stack.id = NOTIF_STACK_ID;
    (document.body || document.documentElement).appendChild(stack);
  }
}

function removeCornerBadge() {
  document.getElementById(CORNER_BADGE_ID)?.remove();
  document.getElementById(NOTIF_STACK_ID)?.remove();
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

const SETTING_TO_PAGE_KEY = {
  injectEnabled: "injectEnabled",
  MetaDataEnabled: "metaDataEnabled",
  method1Enabled: "method1",
  method2Enabled: "method2",
  method3Enabled: "method3",
};

chrome.storage.onChanged.addListener((changes) => {
  for (const key of Object.keys(changes)) {
    const pageKey = SETTING_TO_PAGE_KEY[key];
    if (!pageKey) continue;
    const val = key === "injectEnabled"
      ? changes[key].newValue !== false
      : changes[key].newValue === true;
    pushSetting(pageKey, val);
  }

  if (changes.injectEnabled !== undefined) {
    syncCornerBadge();
    if (isStudioPage()) {
      requestAnimationFrame(() =>
        showBadgeNotif(SETTING_LABELS.injectEnabled, changes.injectEnabled.newValue !== false),
      );
    }
  }

  for (const key of Object.keys(changes)) {
    if (key === "injectEnabled") continue;
    const label = SETTING_LABELS[key];
    if (!label) continue;
    showBadgeNotif(label, changes[key].newValue === true);
  }
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
