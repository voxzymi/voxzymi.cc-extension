const btn = document.getElementById("submitBtn");
const input = document.getElementById("userInput");
const status = document.getElementById("status");
const mainContent = document.getElementById("mainContent");

const TIKTOK_HOSTNAME = /^(www\.)?tiktok\.com$/i;
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 25_000;

const CDN_REPLACEMENTS = [
  [/v16-webapp-prime\.tiktok\.com/gi, "v19-webapp-prime.tiktok.com"],
];

const DEVICE_PROFILES = [
  {
    id: "desktop",
    label: "🖥️ Desktop",
    short: "PC",
    ruleId: 90001,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    secChUa:
      '"Chromium";v="142", "Not(A:Brand";v="24", "Google Chrome";v="142"',
    secChUaMobile: "?0",
    secChUaPlatform: '"Windows"',
  },
  {
    id: "mobile",
    label: "📱 Mobile",
    short: "Phone",
    ruleId: 90002,
    userAgent:
      "Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 5.1; Trident/4.0)",
    secChUa:
      '"Chromium";v="142", "Not(A:Brand";v="24", "Google Chrome";v="142"',
    secChUaMobile: "?1",
    secChUaPlatform: '"Android"',
  },
];

function setStatus(msg, type = "") {
  status.textContent = msg;
  status.className = type;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatNumber(num) {
  if (num === null || num === undefined) return "N/A";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rehostUrl(url) {
  if (!url) return url;
  let out = url;
  for (const [p, r] of CDN_REPLACEMENTS) out = out.replace(p, r);
  return out;
}

function bytesToMB(bytes) {
  const n = parseInt(bytes, 10);
  if (!n) return null;
  return (n / (1024 * 1024)).toFixed(1);
}

function prettifyGearName(g) {
  if (!g) return "Stream";
  return g.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Extract rehydration data (injected into page context) ────────────────────

function extractVideoData() {
  const el = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
  if (!el) return { found: false };
  const raw = (el.textContent || el.innerText || "").trim();
  if (!raw) return { found: false };
  try {
    const data = JSON.parse(raw);
    return { found: true, data };
  } catch (e) {
    return { found: false, parseError: e.message };
  }
}

// ── Build download list from video object ────────────────────────────────────

function buildDownloadsFromVideo(video) {
  const out = [];
  const seenUrls = new Set();

  function add(entry) {
    if (!entry.url || seenUrls.has(entry.url)) return;
    seenUrls.add(entry.url);
    out.push(entry);
  }

  const gears = Array.isArray(video?.bitrateInfo) ? video.bitrateInfo : [];
  for (const gear of gears) {
    const addr = gear?.PlayAddr;
    const rawUrl =
      addr?.UrlList?.find((u) => /tiktok/i.test(u)) || addr?.UrlList?.[0];
    if (!rawUrl) continue;

    const url = rehostUrl(rawUrl);
    const mbps = gear.Bitrate ? (gear.Bitrate / 1_000_000).toFixed(1) : null;
    const dims =
      addr?.Width && addr?.Height ? `${addr.Width}×${addr.Height}` : null;
    const labelParts = [prettifyGearName(gear.GearName)];
    if (dims) labelParts.push(dims);
    if (mbps) labelParts.push(`${mbps} Mbps`);
    if (gear.CodecType) labelParts.push(gear.CodecType.toUpperCase());
    if (gear.BitrateFPS) labelParts.push(`${gear.BitrateFPS}fps`);

    add({
      label: labelParts.join(" · "),
      url,
      width: addr?.Width,
      height: addr?.Height,
      bitrate: gear.Bitrate,
      codec: gear.CodecType,
      format: gear.Format,
      fps: gear.BitrateFPS,
      sizeMB: bytesToMB(addr?.DataSize),
      gear: gear.GearName || "gear",
      qualityType: gear.QualityType,
    });
  }

  const playUrl =
    video?.playAddr ||
    video?.PlayAddrStruct?.UrlList?.find((u) => /tiktok/i.test(u));
  if (playUrl) {
    add({
      label: `Default Stream${video?.definition ? ` (${video.definition})` : ""}`,
      url: rehostUrl(playUrl),
      width: video?.width,
      height: video?.height,
      sizeMB: bytesToMB(video?.size),
      gear: "default",
    });
  }

  if (video?.downloadAddr) {
    add({
      label: "Watermarked Download",
      url: rehostUrl(video.downloadAddr),
      gear: "watermarked",
    });
  }

  out.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  return out;
}

function extractAlternativeDownloads(videoDetail) {
  const video = videoDetail.video || {};
  const downloads = [];
  for (const field of [
    { name: "downloadAddr", label: "Standard Download" },
    { name: "playAddr", label: "High Quality Stream" },
  ]) {
    if (video[field.name])
      downloads.push({
        label: field.label,
        url: rehostUrl(video[field.name]),
        gear: field.name,
      });
  }
  return downloads;
}

function getCreatorRegion(data, videoDetail) {
  const candidates = [];
  const author = videoDetail?.author;
  if (author && typeof author === "object") {
    candidates.push(
      author.region,
      author.regionCode,
      author.location,
      author.country,
    );
  }

  const user =
    data?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo?.user;
  if (user && typeof user === "object") {
    candidates.push(user.region, user.regionCode, user.location, user.country);
  }

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

// ── Parse rehydration JSON ───────────────────────────────────────────────────

function parseVideoDetails(data) {
  const result = {
    id: "",
    title: "",
    description: "",
    author: {
      name: "",
      handle: "",
      avatar: "",
      verified: false,
      bio: "",
      isPrivate: false,
      followers: 0,
      following: 0,
      videoCount: 0,
      likes: 0,
      region: "",
    },
    timestamp: null,
    stats: {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      downloads: 0,
    },
    music: { title: "", duration: null },
    accountRegion: "",
    videoRegion: "",
    geoCity: "",
    shadowBanned: null,
    shadowBanReason: "",
    indexEnabled: null,
    takeDown: 0,
    videoDefinition: "",
    videoCodec: "",
    downloads: [],
    thumbnail: "",
    rawData: data,
  };

  // ── Account-level region from app context ──
  const appCtx = data?.["__DEFAULT_SCOPE__"]?.["webapp.app-context"];
  if (appCtx?.user?.region) result.accountRegion = appCtx.user.region;
  else if (appCtx?.region) result.accountRegion = appCtx.region;

  const bizCtx = data?.["__DEFAULT_SCOPE__"]?.["webapp.biz-context"];
  if (bizCtx?.geoCity?.City) result.geoCity = bizCtx.geoCity.City;
  if (bizCtx?.geo?.[0]) result.geoId = bizCtx.geo[0];

  // ── Profile page path ──
  const userDetail = data?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"];
  if (userDetail?.userInfo?.user) {
    const u = userDetail.userInfo.user;
    const s = userDetail.userInfo.stats || userDetail.userInfo.statsV2;
    result.author.name = u.nickname || "";
    result.author.handle = "@" + (u.uniqueId || "unknown");
    result.author.avatar = u.avatarThumb || "";
    result.author.verified = u.verified || false;
    result.author.bio = u.signature || "";
    result.author.isPrivate = u.privateAccount || false;
    result.author.videoCount = parseInt(s?.videoCount) || 0;
    result.author.followers = parseInt(s?.followerCount) || 0;
    result.author.following = parseInt(s?.followingCount) || 0;
    result.author.likes = parseInt(s?.heart || s?.heartCount) || 0;
    result.author.region = u.region || "";
    if (u.region) result.videoRegion = u.region;
    if (u.createTime) result.timestamp = new Date(u.createTime * 1000);
    return result;
  }

  // ── Video page path ──
  try {
    let videoDetail = null;
    const paths = [
      data?.["__DEFAULT_SCOPE__"]?.["webapp.video-detail"]?.itemInfo
        ?.itemStruct,
      data?.["__DEFAULT_SCOPE__"]?.["webapp.video-detail"]?.[0]?.itemInfo
        ?.itemStruct,
      data?.["__DEFAULT_SCOPE__"]?.["webapp.video-detail-v2"]?.[0]?.itemInfo
        ?.itemStruct,
      data?.["__UNIVERSAL_DATA_FOR_REHYDRATION__"]?.["webapp.video-detail"]?.[0]
        ?.itemInfo?.itemStruct,
    ];
    for (const p of paths) {
      if (p && typeof p === "object") {
        videoDetail = p;
        break;
      }
    }
    if (!videoDetail) videoDetail = searchForVideoObject(data);
    if (!videoDetail) return result;

    result.title = videoDetail.desc || videoDetail.dynamicDesc || "";
    result.description = videoDetail.desc || "";
    result.id = videoDetail.id || videoDetail.video?.id || "";

    // ── Video region ──
    if (videoDetail.locationCreated)
      result.videoRegion = videoDetail.locationCreated;

    // ── Shadow ban detection (multi-signal) ──
    result.indexEnabled =
      typeof videoDetail.indexEnabled === "boolean"
        ? videoDetail.indexEnabled
        : null;
    result.takeDown = videoDetail.takeDown || 0;

    if (videoDetail.riskInfos && videoDetail.riskInfos.type === 1) {
      result.shadowBanned = true;
      result.shadowBanReason = "risk flag";
    } else if (result.indexEnabled === false) {
      result.shadowBanned = true;
      result.shadowBanReason = "not indexed";
    } else if (result.takeDown !== 0) {
      result.shadowBanned = true;
      result.shadowBanReason = `takedown (${result.takeDown})`;
    } else if (videoDetail.isReviewing) {
      result.shadowBanned = null; // under review – unknown
      result.shadowBanReason = "under review";
    } else if (result.indexEnabled === true) {
      result.shadowBanned = false;
      result.shadowBanReason = "indexed";
    } else {
      result.shadowBanned = null;
      result.shadowBanReason = "unknown";
    }

    if (videoDetail.music) {
      result.music.title =
        videoDetail.music.title || videoDetail.music.authorName || "";
      result.music.duration = videoDetail.music.duration || null;
    }

    const author = videoDetail.author;
    if (author) {
      result.author.name = author.nickname || "Unknown";
      result.author.handle = "@" + (author.uniqueId || "unknown");
      result.author.avatar =
        author.avatarLarger || author.avatarMedium || author.avatar || "";
      result.author.verified = author.verified || false;
      result.author.bio = author.signature || "";
    }

    result.author.region = getCreatorRegion(data, videoDetail);

    const authorStats = videoDetail.authorStats || videoDetail.authorStatsV2;
    if (authorStats) {
      result.author.followers = parseInt(authorStats.followerCount) || 0;
      result.author.following = parseInt(authorStats.followingCount) || 0;
      result.author.videoCount = parseInt(authorStats.videoCount) || 0;
    }

    if (videoDetail.createTime)
      result.timestamp = new Date(videoDetail.createTime * 1000);

    const stats = videoDetail.stats || videoDetail.statsV2;
    if (stats) {
      result.stats.views = parseInt(stats.playCount) || 0;
      result.stats.likes = parseInt(stats.diggCount) || 0;
      result.stats.comments = parseInt(stats.commentCount) || 0;
      result.stats.shares = parseInt(stats.shareCount) || 0;
      result.stats.saves = parseInt(stats.collectCount) || 0;
      result.stats.downloads = parseInt(stats.downloadCount) || 0;
    }

    const video = videoDetail.video;
    if (video) {
      result.downloads = buildDownloadsFromVideo(video);
      result.videoDefinition = video.definition || video.ratio || "";
      result.videoCodec = video.codecType || "";
      result.thumbnail =
        video.dynamicCover || video.cover || video.originCover || "";
    }

    if (result.downloads.length === 0)
      result.downloads = extractAlternativeDownloads(videoDetail);
  } catch (e) {
    console.error("parseVideoDetails:", e);
  }

  return result;
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

// ── Chrome extension tab orchestration ──────────────────────────────────────

async function applyUserAgentOverride(tabId, profile) {
  if (!profile.userAgent) return null;
  if (!chrome.declarativeNetRequest?.updateSessionRules)
    throw new Error('"declarativeNetRequest" API unavailable');

  const headers = [
    { header: "User-Agent", operation: "set", value: profile.userAgent },
  ];
  if (profile.secChUa)
    headers.push({
      header: "sec-ch-ua",
      operation: "set",
      value: profile.secChUa,
    });
  if (profile.secChUaMobile)
    headers.push({
      header: "sec-ch-ua-mobile",
      operation: "set",
      value: profile.secChUaMobile,
    });
  if (profile.secChUaPlatform)
    headers.push({
      header: "sec-ch-ua-platform",
      operation: "set",
      value: profile.secChUaPlatform,
    });

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [profile.ruleId],
    addRules: [
      {
        id: profile.ruleId,
        priority: 1,
        condition: {
          tabIds: [tabId],
          resourceTypes: [
            "main_frame",
            "sub_frame",
            "xmlhttprequest",
            "media",
            "image",
            "script",
            "other",
          ],
        },
        action: { type: "modifyHeaders", requestHeaders: headers },
      },
    ],
  });
  return profile.ruleId;
}

async function clearUserAgentOverride(ruleId) {
  if (!ruleId || !chrome.declarativeNetRequest?.updateSessionRules) return;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
    });
  } catch {}
}

function waitForTabLoad(tabId, timeoutMs = 8_000) {
  return new Promise((resolve) => {
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs);
  });
}

async function openAndExtract(url, profile) {
  const out = {
    profile,
    raw: null,
    parsed: null,
    error: null,
    overrideFailed: false,
  };
  let tab;
  try {
    tab = await chrome.tabs.create({ url: "about:blank", active: false });
  } catch (err) {
    out.error = `Could not open tab: ${err.message}`;
    return out;
  }

  let ruleId = null;
  if (profile.userAgent) {
    try {
      ruleId = await applyUserAgentOverride(tab.id, profile);
    } catch {
      out.overrideFailed = true;
    }
  }

  try {
    await chrome.tabs.update(tab.id, { url });
  } catch (err) {
    await clearUserAgentOverride(ruleId);
    chrome.tabs.remove(tab.id).catch(() => {});
    out.error = `Could not navigate tab: ${err.message}`;
    return out;
  }

  await waitForTabLoad(tab.id);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let attempt = 0,
    finalResult = null;

  while (Date.now() < deadline) {
    attempt++;
    setStatus(`[${profile.short}] Searching… (attempt ${attempt})`, "loading");
    let injRes;
    try {
      injRes = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractVideoData,
      });
    } catch (err) {
      out.error = `Script injection failed: ${err.message}`;
      break;
    }
    const result = injRes?.[0]?.result;
    if (result?.found) {
      finalResult = result.data;
      break;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  await clearUserAgentOverride(ruleId);
  chrome.tabs.remove(tab.id).catch(() => {});

  if (!finalResult) {
    out.error = out.error || `Data not found after ${attempt} attempt(s).`;
    return out;
  }
  out.raw = finalResult;
  out.parsed = parseVideoDetails(finalResult);
  return out;
}

// ── Rendering helpers ────────────────────────────────────────────────────────

function fmtTimestamp(date) {
  if (!date) return null;
  return (
    date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }) +
    ", " +
    date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );
}

function nowHHMM() {
  const n = new Date();
  return (
    n.getHours().toString().padStart(2, "0") +
    ":" +
    n.getMinutes().toString().padStart(2, "0")
  );
}

function parseCaptionHTML(txt) {
  if (!txt) return "";
  return escHtml(txt)
    .replace(/(@[\w.]+)/g, '<span class="mention">$1</span>')
    .replace(/(#[\w]+)/g, '<span class="hashtag">$1</span>');
}

function streamLinkButton(dl, idx) {
  const label = dl.gear ? escHtml(dl.gear) : `stream_${idx}`;
  return `<a class="stream-link" href="${escHtml(dl.url)}" target="_blank" rel="noopener noreferrer" title="${escHtml(dl.label || label)}">
    <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    ${label}</a>`;
}

// ── Collapsible accordion section ─────────────────────────────────────────────

function accordionSection(title, icon, innerHTML, open = false) {
  return `<div class="accordion${open ? " open" : ""}">
    <button class="accordion-header" type="button" aria-expanded="${open}">
      <span class="accordion-title-wrap">
        <span class="accordion-icon">${icon}</span>
        <span class="accordion-title">${title}</span>
      </span>
      <svg class="accordion-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="accordion-body">
      <div class="accordion-clip">
        <div class="accordion-inner">${innerHTML}</div>
      </div>
    </div>
  </div>`;
}

// ── Main video analysis card ─────────────────────────────────────────────────

function renderVideoAnalysisHTML(videoData) {
  const stats = videoData.stats || {};
  const author = videoData.author || {};
  const downloads = videoData.downloads || [];
  const music = videoData.music || {};

  const authorNick = author.name || "Unknown";
  const createTime = fmtTimestamp(videoData.timestamp);
  const authorRegion = author.region || "";

  const avatarHtml = author.avatar
    ? `<img src="${escHtml(author.avatar)}" alt="" onerror="this.style.display='none'">`
    : authorNick.charAt(0).toUpperCase();

  // ── Shadow ban badge ──
  let sbanClass = "unknown",
    sbanLabel = "—";
  if (videoData.shadowBanned === true) {
    sbanClass = "banned";
    sbanLabel = "⚠ Shadow banned";
  }
  if (videoData.shadowBanned === false) {
    sbanClass = "clean";
    sbanLabel = "✓ Clean";
  }
  if (
    videoData.shadowBanned === null &&
    videoData.shadowBanReason === "under review"
  ) {
    sbanClass = "unknown";
    sbanLabel = "⏳ Under review";
  }

  // ── Quality label (just the definition + codec, not all streams) ──
  let qualLabel = "—";
  if (videoData.videoDefinition) {
    qualLabel = videoData.videoDefinition.toUpperCase();
    if (videoData.videoCodec)
      qualLabel += " · " + videoData.videoCodec.toUpperCase();
  } else if (downloads[0]) {
    const b = downloads[0];
    qualLabel = b.width && b.height ? `${b.width}×${b.height}` : b.label || "—";
  }

  // ── Stream buttons (links only, no full detail list) ──
  const streamButtons = downloads
    .map((dl, i) => streamLinkButton(dl, i))
    .join("");

  // ── Region display ──
  const accRegion = videoData.accountRegion || "—";
  const vidRegion = videoData.videoRegion || "—";
  const geoCity = videoData.geoCity || "";

  // ── Index status text ──
  const indexedText =
    videoData.indexEnabled === true
      ? "Yes"
      : videoData.indexEnabled === false
        ? "No"
        : "—";
  const indexedClass =
    videoData.indexEnabled === true
      ? "green"
      : videoData.indexEnabled === false
        ? "red"
        : "muted";

  // ── Raw data JSON string ──
  const rawStr = JSON.stringify(videoData.rawData || {});
  const rawKB = (new TextEncoder().encode(rawStr).length / 1024).toFixed(1);

  let html = `<div class="result-card">
    <div class="card-header-bar">
      <span class="card-header-icon">📹</span>
      <span class="card-header-title">VIDEO</span>
      <span class="card-header-dot">•</span>
      <span class="card-header-title" style="color:var(--muted)">ANALYTICS</span>
    </div>

    <div class="msg-author-row">
      <div class="msg-author-avatar">${avatarHtml}</div>
      <span class="msg-author-name">${escHtml(authorNick)}${author.verified ? ' <span class="verified-badge">✓</span>' : ""}</span>
      ${authorRegion ? `<span class="region-chip">${escHtml(authorRegion)}</span>` : ""}
      ${createTime ? `<span class="msg-author-date">${createTime}</span>` : ""}
    </div>

    ${videoData.title ? `<div class="msg-caption">${parseCaptionHTML(videoData.title.substring(0, 220))}</div>` : ""}

    ${
      music.title
        ? `<div class="msg-sound">
      <span class="sound-icon">🎵</span>
      <span class="sound-name">${escHtml(music.title)}</span>
      ${music.duration ? `<span class="sound-sep">•</span><span>${music.duration}s</span>` : ""}
    </div>`
        : ""
    }

    <div class="msg-divider"></div>

    <div class="accordion-list">
      ${accordionSection(
        "Statistics",
        "📊",
        `<div class="panel-list">
          <div class="panel-row"><span class="panel-bullet">•</span><span class="panel-icon">👁</span><span class="stat-num">${formatNumber(stats.views)}</span><span class="panel-label">Views</span></div>
          <div class="panel-row"><span class="panel-bullet">•</span><span class="panel-icon">♡</span><span class="stat-num">${formatNumber(stats.likes)}</span><span class="panel-label">Likes</span></div>
          <div class="panel-row"><span class="panel-bullet">•</span><span class="panel-icon">💬</span><span class="stat-num">${formatNumber(stats.comments)}</span><span class="panel-label">Comments</span></div>
          <div class="panel-row"><span class="panel-bullet">•</span><span class="panel-icon">🔖</span><span class="stat-num">${formatNumber(stats.saves)}</span><span class="panel-label">Favorites</span></div>
          <div class="panel-row"><span class="panel-bullet">•</span><span class="panel-icon">↗</span><span class="stat-num">${formatNumber(stats.shares)}</span><span class="panel-label">Shares</span></div>
        </div>`,
        true,
      )}
      ${accordionSection(
        "Information",
        "ℹ️",
        `<div class="panel-list">
          <div class="panel-row"><span class="panel-bullet">•</span><span class="panel-icon">🔑</span><span class="panel-label">ID</span><span class="panel-sep">|</span><span class="panel-val yellow">${escHtml(videoData.id || "—")}</span></div>
          <div class="panel-row"><span class="panel-bullet">•</span><span class="panel-icon">🎬</span><span class="panel-label">Vid&nbsp;region</span><span class="panel-sep">|</span><span class="region-chip">${escHtml(vidRegion)}</span></div>
          <div class="panel-row"><span class="panel-bullet">•</span><span class="panel-icon">🔍</span><span class="panel-label">Indexed</span><span class="panel-sep">|</span><span class="panel-val ${indexedClass}">${indexedText}</span></div>
        </div>`,
      )}
      ${accordionSection(
        "Shadow Ban",
        "🛡️",
        `<div class="panel-list">
          <div class="panel-row"><span class="sban-badge ${sbanClass}">${sbanLabel}</span></div>
          ${videoData.shadowBanReason ? `<div class="panel-row"><span class="panel-bullet">•</span><span class="panel-icon">📋</span><span class="panel-label">Reason</span><span class="panel-sep">|</span><span class="panel-val muted">${escHtml(videoData.shadowBanReason)}</span></div>` : ""}
          ${videoData.takeDown ? `<div class="panel-row"><span class="panel-bullet">•</span><span class="panel-icon">🚫</span><span class="panel-label">Takedown</span><span class="panel-sep">|</span><span class="panel-val red">${videoData.takeDown}</span></div>` : ""}
        </div>`,
      )}
      ${accordionSection(
        "Quality &amp; Streams",
        "🎞️",
        `<div class="quality-badge">▶ ${escHtml(qualLabel)}</div>
        ${downloads.length ? `<div class="stream-links-row">${streamButtons}</div>` : `<div class="panel-val muted">No streams found.</div>`}`,
      )}
      ${
        author.followers || author.videoCount || author.following || author.bio
          ? accordionSection(
              "Creator",
              "👤",
              `<div class="panel-list">
          ${author.followers ? `<div class="panel-row"><span class="panel-icon">👥</span><span class="panel-val white">${formatNumber(author.followers)}</span><span class="panel-label" style="margin-left:3px">followers</span></div>` : ""}
          ${author.videoCount ? `<div class="panel-row"><span class="panel-icon">🎬</span><span class="panel-val white">${formatNumber(author.videoCount)}</span><span class="panel-label" style="margin-left:3px">videos</span></div>` : ""}
          ${author.following ? `<div class="panel-row"><span class="panel-icon">➕</span><span class="panel-val white">${formatNumber(author.following)}</span><span class="panel-label" style="margin-left:3px">following</span></div>` : ""}
          ${author.likes ? `<div class="panel-row"><span class="panel-icon">❤️</span><span class="panel-val white">${formatNumber(author.likes)}</span><span class="panel-label" style="margin-left:3px">likes</span></div>` : ""}
          ${author.bio ? `<div class="panel-row"><span class="panel-icon">📝</span><span class="panel-val muted">${escHtml(author.bio)}</span></div>` : ""}
        </div>`,
            )
          : ""
      }
    </div>

    <div class="card-footer">
      <span class="card-footer-brand">voxzymi.cc</span>
      <div class="card-footer-right">
        <span class="card-footer-time">${nowHHMM()}</span>
        <button class="recheck-btn" id="recheckBtn" type="button">
          <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Recheck
        </button>
      </div>
    </div>
  </div>

  <!-- Raw data – copy only, no viewer -->
  <div class="raw-data-section">
    <div class="raw-data-card">
      <div class="raw-data-header">
        <span class="raw-data-label">Raw Rehydration Data</span>
        <button class="copy-btn" id="copyRawBtn" type="button">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy JSON
        </button>
      </div>
      <div class="raw-data-meta">
        <span>Size:&nbsp;<b>${rawKB}&nbsp;KB</b></span>
        <span>Keys:&nbsp;<b>${Object.keys(videoData.rawData?.["__DEFAULT_SCOPE__"] || {}).length}</b></span>
        <span>Source:&nbsp;<b>__UNIVERSAL_DATA_FOR_REHYDRATION__</b></span>
      </div>
    </div>
  </div>`;

  return html;
}

// ── Device comparison card ───────────────────────────────────────────────────

function getCurrentPlayerQuality(videoData) {
  const downloads = videoData?.downloads || [];
  const current = downloads[0];
  const parts = [];

  if (videoData?.videoDefinition)
    parts.push(videoData.videoDefinition.toUpperCase());
  if (videoData?.videoCodec) parts.push(videoData.videoCodec.toUpperCase());

  const label = parts.join(" · ") || current?.label || "Unknown quality";
  const details = [];
  if (current?.width && current?.height)
    details.push(`${current.width}×${current.height}`);
  if (current?.bitrate)
    details.push(`${(current.bitrate / 1_000_000).toFixed(1)} Mbps`);
  if (current?.sizeMB) details.push(`${current.sizeMB} MB`);

  return { label, detail: details.join(" · ") };
}

function renderDeviceComparisonHTML(results) {
  let html = `<div class="result-card">
    <div class="card-header-bar">
      <span class="card-header-icon">📡</span>
      <span class="card-header-title">DEVICE</span>
      <span class="card-header-dot">•</span>
      <span class="card-header-title" style="color:var(--muted)">COMPARISON</span>
    </div>
    <div class="msg-section">
      <p class="device-intro">Same URL opened per device profile. Each card plays the best stream received.</p>
      <div class="device-grid">`;

  for (const r of results) {
    const { profile } = r;
    html += `<div class="device-card">`;
    html += `<div class="device-card-header"><span class="device-name">${escHtml(profile.label)}</span></div>`;
    html += `<div class="device-ua">${profile.userAgent ? escHtml(profile.userAgent.substring(0, 80)) + "…" : "Extension's real UA"}</div>`;

    if (r.overrideFailed)
      html += `<div class="device-warning">⚠️ Couldn't override UA — missing "declarativeNetRequest" permission.</div>`;
    if (r.error) {
      html += `<div class="device-warning">⚠️ ${escHtml(r.error)}</div></div>`;
      continue;
    }

    const dls = r.parsed?.downloads || [];
    const best = dls[0];
    const currentQuality = getCurrentPlayerQuality(r.parsed);

    if (best) {
      html += `<video class="device-video" controls preload="none"${r.parsed.thumbnail ? ` poster="${escHtml(r.parsed.thumbnail)}"` : ""}>
        <source src="${escHtml(best.url)}" type="video/mp4">
      </video>`;
      html += `<div class="device-quality">
        <div class="quality-badge">▶ ${escHtml(currentQuality.label)}</div>`;
      if (currentQuality.detail) {
        html += `<div class="device-quality-meta">${escHtml(currentQuality.detail)}</div>`;
      }
      html += `</div>`;
    } else {
      html += `<div class="device-warning">No streams found for this profile.</div>`;
    }

    html += `</div>`;
  }

  html += `</div></div></div>`;
  return html;
}

// ── Compose full result + wire up copy button ────────────────────────────────

function renderComparisonAnalysis(results) {
  const primary =
    results.find((r) => r.profile.id === "native" && r.parsed) ||
    results.find((r) => r.parsed);

  mainContent.classList.add("results-mode");
  mainContent.innerHTML =
    renderVideoAnalysisHTML(primary.parsed) +
    renderDeviceComparisonHTML(results);

  // accordion toggles
  mainContent.querySelectorAll(".accordion-header").forEach((header) => {
    header.addEventListener("click", () => {
      const acc = header.closest(".accordion");
      const isOpen = acc.classList.toggle("open");
      header.setAttribute("aria-expanded", String(isOpen));
    });
  });

  // recheck
  const recheckBtn = document.getElementById("recheckBtn");
  if (recheckBtn) recheckBtn.addEventListener("click", () => btn.click());

  // copy raw JSON
  const copyBtn = document.getElementById("copyRawBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const rawStr = JSON.stringify(primary.parsed.rawData || {}, null, 2);
      navigator.clipboard
        .writeText(rawStr)
        .then(() => {
          copyBtn.textContent = "✓ Copied!";
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy JSON`;
            copyBtn.classList.remove("copied");
          }, 2000);
        })
        .catch(() => {
          // fallback for extension context
          const ta = document.createElement("textarea");
          ta.value = JSON.stringify(primary.parsed.rawData || {}, null, 2);
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          copyBtn.textContent = "✓ Copied!";
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2v1"/></svg> Copy JSON`;
            copyBtn.classList.remove("copied");
          }, 2000);
        });
    });
  }
}

// ── Main flow ────────────────────────────────────────────────────────────────

btn.addEventListener("click", async () => {
  const rawUrl = input.value.trim();
  if (!rawUrl) {
    setStatus("Please enter a TikTok URL.", "error");
    return;
  }

  let url = rawUrl;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    setStatus("Invalid URL.", "error");
    return;
  }

  if (!TIKTOK_HOSTNAME.test(parsed.hostname)) {
    setStatus("Only TikTok URLs are supported (tiktok.com).", "error");
    return;
  }

  btn.disabled = true;
  mainContent.classList.remove("results-mode");
  mainContent.innerHTML = `<div class="empty-state">
    <div class="empty-state-icon">⏳</div>
    <div class="empty-state-title">Analyzing across ${DEVICE_PROFILES.length} device profiles…</div>
    <p>Opening the page per profile (desktop, mobile) to compare what each is served.</p>
  </div>`;

  const results = [];
  for (const profile of DEVICE_PROFILES) {
    setStatus(`Opening as: ${profile.short}…`, "loading");
    results.push(await openAndExtract(url, profile));
  }

  const successCount = results.filter((r) => r.parsed).length;

  if (successCount === 0) {
    setStatus("Couldn't extract video data for any device profile.", "error");
    mainContent.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">No data found</div>
      <p>The page may require login, or TikTok changed its data format.</p>
    </div>`;
    btn.disabled = false;
    return;
  }

  renderComparisonAnalysis(results);
  setStatus(
    `✓ Done — ${successCount}/${DEVICE_PROFILES.length} profiles returned data.`,
    "success",
  );
  btn.disabled = false;
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btn.click();
});
