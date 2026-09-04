const CDN_REPLACEMENTS = [
  [/v16-webapp-prime\.tiktok\.com/gi, "v19-webapp-prime.tiktok.com"],
];

function rehostUrl(url) {
  if (!url) return url;
  let out = url;
  for (const [p, r] of CDN_REPLACEMENTS) out = out.replace(p, r);
  return out;
}

function extractRehydrationJson(html) {
  const m = html.match(
    /<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/,
  );
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function findItemStruct(data) {
  const paths = [
    data?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct,
    data?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.[0]?.itemInfo?.itemStruct,
    data?.__DEFAULT_SCOPE__?.["webapp.video-detail-v2"]?.[0]?.itemInfo?.itemStruct,
    data?.__UNIVERSAL_DATA_FOR_REHYDRATION__?.["webapp.video-detail"]?.[0]?.itemInfo?.itemStruct,
  ];
  for (const p of paths) if (p && typeof p === "object") return p;
  return searchForVideoObject(data);
}

function searchForVideoObject(obj, depth = 0, max = 5) {
  if (depth > max || !obj || typeof obj !== "object") return null;
  if ((obj.desc || obj.video) && (obj.author || obj.stats)) return obj;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const r = searchForVideoObject(obj[key], depth + 1, max);
      if (r) return r;
    }
  }
  return null;
}

function pickHighestQualityUrl(itemStruct) {
  const video = itemStruct?.video || {};
  const gears = Array.isArray(video.bitrateInfo) ? video.bitrateInfo.slice() : [];
  gears.sort((a, b) => {
    const areaA = (a?.PlayAddr?.Width || 0) * (a?.PlayAddr?.Height || 0);
    const areaB = (b?.PlayAddr?.Width || 0) * (b?.PlayAddr?.Height || 0);
    if (areaB !== areaA) return areaB - areaA;
    return (b?.Bitrate || 0) - (a?.Bitrate || 0);
  });
  for (const gear of gears) {
    const addr = gear?.PlayAddr;
    const raw =
      addr?.UrlList?.find((u) => /tiktok/i.test(u)) || addr?.UrlList?.[0];
    if (raw) {
      return {
        url: rehostUrl(raw),
        bitrate: gear.Bitrate,
        width: addr?.Width,
        height: addr?.Height,
        codec: gear.CodecType,
        gear: gear.GearName,
      };
    }
  }
  const playAddr = video.playAddr;
  if (playAddr) return { url: rehostUrl(playAddr) };
  const dl = video.downloadAddr;
  if (dl) return { url: rehostUrl(dl) };
  return null;
}

async function resolveVideoUrlFromPage(videoUrl) {
  const res = await fetch(videoUrl, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  if (!res.ok) throw new Error("page HTTP_" + res.status);
  const html = await res.text();
  const data = extractRehydrationJson(html);
  if (!data) throw new Error("no rehydration data");
  const itemStruct = findItemStruct(data);
  if (!itemStruct) throw new Error("no video detail");
  const pick = pickHighestQualityUrl(itemStruct);
  if (!pick?.url) throw new Error("no playable url");
  const id = itemStruct.id || itemStruct.video?.id || Date.now();
  const authorId = itemStruct.author?.uniqueId || itemStruct.author?.id || "video";
  return {
    downloadUrl: pick.url,
    suggestedName: `${authorId}_${id}.mp4`,
    bitrate: pick.bitrate,
    width: pick.width,
    height: pick.height,
    codec: pick.codec,
    gear: pick.gear,
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === "DOWNLOAD_URL" && typeof msg.url === "string") {
    chrome.downloads.download({ url: msg.url, filename: msg.filename });
    return;
  }
  if (msg?.action === "RESOLVE_TIKTOK_VIDEO" && typeof msg.videoUrl === "string") {
    resolveVideoUrlFromPage(msg.videoUrl)
      .then((info) => {
        chrome.downloads.download({ url: info.downloadUrl, filename: info.suggestedName });
        sendResponse({ ok: true, info });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
});
