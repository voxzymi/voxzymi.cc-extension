window.__pageSettings = window.__pageSettings || {};
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (d?.source !== "page-settings") return;
  if (d.action === "replace") window.__pageSettings = { ...window.__pageSettings, ...(d.settings || {}) };
  else if (d.action === "update") window.__pageSettings[d.key] = d.value;
});
window.postMessage({ source: "page-settings-request" }, "*");

function readFourCC(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function readBox(view, offset, limit) {
  if (offset + 8 > limit) return null;
  let size = view.getUint32(offset, false);
  const type = readFourCC(view, offset + 4);
  let header = 8;
  if (size === 1) {
    if (offset + 16 > limit) return null;
    size =
      view.getUint32(offset + 8, false) * 2 ** 32 +
      view.getUint32(offset + 12, false);
    header = 16;
  } else if (size === 0) {
    size = limit - offset;
  }
  if (size < header || offset + size > limit) return null;
  return { type, start: offset, size, header };
}

function* childBoxes(view, box) {
  const end = box.start + box.size;
  let offset = box.start + box.header;
  while (offset < end) {
    const child = readBox(view, offset, end);
    if (!child) return;
    yield child;
    offset += child.size;
  }
}

function findChild(view, box, type) {
  for (const child of childBoxes(view, box)) {
    if (child.type === type) return child;
  }
  return null;
}

function timescaleOffset(view, box) {
  const payload = box.start + box.header;
  const version = view.getUint8(payload);
  if (version === 0) return payload + 12;
  if (version === 1) return payload + 20;
  return null;
}

function trackFPS(view, trak, mediaTimescale) {
  const mdia = findChild(view, trak, "mdia");
  if (!mdia) return null;
  const hdlr = findChild(view, mdia, "hdlr");
  if (!hdlr || readFourCC(view, hdlr.start + hdlr.header + 8) !== "vide") return null;
  const minf = findChild(view, mdia, "minf");
  const stbl = minf && findChild(view, minf, "stbl");
  const stts = stbl && findChild(view, stbl, "stts");
  if (!stts) return null;

  const base = stts.start + stts.header;
  const entryCount = view.getUint32(base + 4, false);
  if (!entryCount || stts.size < 16 + entryCount * 8) return null;

  let sampleCount = 0;
  let totalDuration = 0;
  for (let i = 0; i < entryCount; i++) {
    const count = view.getUint32(base + 8 + i * 8, false);
    const delta = view.getUint32(base + 12 + i * 8, false);
    sampleCount += count;
    totalDuration += count * delta;
  }
  if (!sampleCount || !totalDuration) return null;
  return (mediaTimescale * sampleCount) / totalDuration;
}

async function scanTopLevelBoxes(file) {
  let offset = 0;
  let moov = null;
  let fragmented = false;
  let sawAnyBox = false;

  while (offset + 8 <= file.size) {
    const head = new DataView(
      await file.slice(offset, Math.min(offset + 16, file.size)).arrayBuffer(),
    );
    const box = readBox(head, 0, file.size - offset);
    if (!box) return sawAnyBox ? { moov, fragmented } : null;
    if (offset === 0 && box.type !== "ftyp") return null;
    sawAnyBox = true;
    if (box.type === "moov") moov = { ...box, start: offset };
    if (box.type === "moof") fragmented = true;
    offset += box.size;
  }
  return { moov, fragmented };
}

async function patchTimescales(file) {
  const layout = await scanTopLevelBoxes(file);
  if (!layout || !layout.moov || layout.fragmented) return null;

  const moovBuffer = await file
    .slice(layout.moov.start, layout.moov.start + layout.moov.size)
    .arrayBuffer();
  const view = new DataView(moovBuffer);

  const moov = readBox(view, 0, moovBuffer.byteLength);
  if (!moov || moov.type !== "moov") return null;

  const mvhd = findChild(view, moov, "mvhd");
  const movieTimescaleAt = mvhd && timescaleOffset(view, mvhd);
  if (movieTimescaleAt == null) return null;

  let detectedFPS = null;
  const trackTimescaleOffsets = [];

  for (const box of childBoxes(view, moov)) {
    if (box.type !== "trak") continue;
    const mdia = findChild(view, box, "mdia");
    const mdhd = mdia && findChild(view, mdia, "mdhd");
    const at = mdhd && timescaleOffset(view, mdhd);
    if (at == null) return null;
    trackTimescaleOffsets.push(at);
    detectedFPS = detectedFPS ?? trackFPS(view, box, view.getUint32(at, false));
  }

  if (!detectedFPS || detectedFPS < 31) return null;

  const ratio = detectedFPS / 30;
  const scaleDown = (at) => {
    view.setUint32(at, Math.max(1, Math.round(view.getUint32(at, false) / ratio)), false);
  };
  scaleDown(movieTimescaleAt);
  trackTimescaleOffsets.forEach(scaleDown);

  return new File(
    [
      file.slice(0, layout.moov.start),
      moovBuffer,
      file.slice(layout.moov.start + layout.moov.size),
    ],
    file.name,
    { type: file.type || "video/mp4", lastModified: file.lastModified },
  );
}

const TOPAZ_KEYWORDS = [
  "topaz",
  "enhanced using",
  "processed using",
  "videoai",
  "tvai_scale",
  "tvai",
];
const GIBBERISH_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomGibberishChar() {
  return GIBBERISH_CHARS.charCodeAt(Math.floor(Math.random() * GIBBERISH_CHARS.length));
}

function scrubMetadataString(buffer, searchString) {
  const u8 = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const searchLower = searchString.toLowerCase();
  const DATA = [0x64, 0x61, 0x74, 0x61];
  let count = 0;

  for (let i = 4; i <= u8.length - 4; i++) {
    if (u8[i] !== DATA[0] || u8[i + 1] !== DATA[1] ||
        u8[i + 2] !== DATA[2] || u8[i + 3] !== DATA[3]) continue;

    const atomSize = view.getUint32(i - 4, false);
    if (atomSize < 16 || atomSize > 200000) continue;

    const payloadStart = i + 12;
    const payloadLen = atomSize - 16;
    if (payloadLen <= 0 || payloadStart + payloadLen > u8.length) continue;

    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: false })
        .decode(u8.slice(payloadStart, payloadStart + payloadLen));
    } catch (_) { continue; }

    if (!text.toLowerCase().includes(searchLower)) continue;

    for (let k = 0; k < payloadLen; k++) u8[payloadStart + k] = randomGibberishChar();
    count++;
    i = payloadStart + payloadLen - 1;
  }
  return { buffer, count };
}

async function scrubTopazFromFile(file) {
  const buffer = await file.arrayBuffer();
  for (const keyword of TOPAZ_KEYWORDS) scrubMetadataString(buffer, keyword);
  return new File([buffer], file.name, {
    type: file.type || "video/mp4",
    lastModified: file.lastModified,
  });
}

async function hijack(file) {
  const patched = await patchTimescales(file);
  if (!patched) return { file, applied: false };
  const originalName = file.name || "video.mp4";
  const newFileName = originalName.replace(/\.[^/.]+$/, "") + " - fps patch applied.mp4";
  return {
    file: new File([patched], newFileName, {
      type: file.type || "video/mp4",
      lastModified: file.lastModified,
    }),
    applied: true,
  };
}

async function applyModifications(file) {
  let result = file;
  const applied = [];
  if (window.__pageSettings?.method2 === true) {
    const r = await hijack(result);
    result = r.file;
    if (r.applied) applied.push("timescale");
  }
  if (window.__pageSettings?.metaDataEnabled) {
    result = await scrubTopazFromFile(result);
    applied.push("topaz");
  }
  if (window.__pageSettings?.method1 === true) applied.push("blob");
  return { file: result, applied };
}

function buildFileList(files) {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  return dt.files;
}

function notifyPatched(inputEl, fileNames, applied) {
  const ev = new CustomEvent("hijack-applied", {
    bubbles: true,
    detail: { inputEl, fileNames, applied: applied || [] },
  });
  (inputEl || document).dispatchEvent(ev);
}

function hijackInput(input) {
  if (input._tiktokHijacked) return;
  input._tiktokHijacked = true;

  input.addEventListener("change", async (e) => {
    if (e.isSynthetic) return;
    e.stopImmediatePropagation();

    const originalFiles = Array.from(input.files);
    if (originalFiles.length === 0) return;

    const results = await Promise.all(originalFiles.map(applyModifications));
    const modifiedFiles = results.map((r) => r.file);
    const appliedSet = [...new Set(results.flatMap((r) => r.applied))];

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "files",
    )?.set;
    if (nativeSetter) nativeSetter.call(input, buildFileList(modifiedFiles));
    else input.files = buildFileList(modifiedFiles);

    notifyPatched(input, modifiedFiles.map((f) => f.name), appliedSet);

    const syntheticEvent = new Event("change", { bubbles: true });
    syntheticEvent.isSynthetic = true;
    input.dispatchEvent(syntheticEvent);
  }, true);
}

window.addEventListener("drop", async (e) => {
  if (e._tiktokHijacked) return;
  if (!e.dataTransfer || !e.dataTransfer.files.length) return;

  e.preventDefault();
  e.stopImmediatePropagation();

  const originalFiles = Array.from(e.dataTransfer.files);
  const results = await Promise.all(originalFiles.map(applyModifications));
  const modifiedFiles = results.map((r) => r.file);
  const appliedSet = [...new Set(results.flatMap((r) => r.applied))];

  const dt = new DataTransfer();
  for (const f of modifiedFiles) dt.items.add(f);

  const syntheticDrop = new DragEvent("drop", {
    bubbles: true, cancelable: true, composed: true,
    clientX: e.clientX, clientY: e.clientY,
  });
  Object.defineProperty(syntheticDrop, "dataTransfer", { value: dt });
  syntheticDrop._tiktokHijacked = true;

  notifyPatched(e.target, modifiedFiles.map((f) => f.name), appliedSet);
  e.target.dispatchEvent(syntheticDrop);
}, true);

function scanForInputs(root = document) {
  root.querySelectorAll('input[type="file"]').forEach(hijackInput);
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches('input[type="file"]')) hijackInput(node);
      node.querySelectorAll('input[type="file"]').forEach(hijackInput);
    }
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });
scanForInputs();
