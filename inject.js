(function () {
  window.__pageSettings = window.__pageSettings || {};
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (d?.source !== "page-settings") return;
    if (d.action === "replace") window.__pageSettings = { ...window.__pageSettings, ...(d.settings || {}) };
    else if (d.action === "update") window.__pageSettings[d.key] = d.value;
  });
  window.postMessage({ source: "page-settings-request" }, "*");

  const FPS = 67;
  const MIN_BR = 8_000_000;
  const RES = { w: 720, h: 1280 };
  const SHORT = RES.w;

  function forceResolution(obj) {
    if (!obj) return;
    if (obj.width !== undefined && obj.height !== undefined) {
      const portrait = obj.height >= obj.width;
      const [target_w, target_h] = portrait ? [RES.w, RES.h] : [RES.h, RES.w];
      if (obj.width < target_w || obj.height < target_h) {
        obj.width = target_w;
        obj.height = target_h;
      }
    }
    if (typeof obj.resolution === "number" && obj.resolution < SHORT) obj.resolution = SHORT;
    if (typeof obj.short_side === "number" && obj.short_side < SHORT) obj.short_side = SHORT;
    if (obj.quality_level !== undefined) obj.quality_level = 0;
  }

  function forceFPS(obj) {
    if (!obj) return;
    ["fps", "frame_rate", "framerate", "video_fps", "target_fps"].forEach((k) => {
      if (typeof obj[k] === "number" && obj[k] < FPS) obj[k] = FPS;
    });
  }

  function forceBitrate(obj) {
    if (!obj) return;
    ["bitrate", "video_bitrate", "target_bitrate", "max_bitrate"].forEach((k) => {
      if (typeof obj[k] === "number" && obj[k] < MIN_BR) obj[k] = MIN_BR;
    });
    if (obj.bitrate_mode !== undefined) obj.bitrate_mode = "vbr";
    if (obj.encode_bitrate_mode !== undefined) obj.encode_bitrate_mode = 0;
  }

  function removeCompressionFields(obj) {
    if (!obj || typeof obj !== "object") return;
    [
      "compress_settings", "compression_level", "compress_type", "compress_quality",
      "compress_params", "compression_info", "client_compress", "auto_compress",
    ].forEach((k) => { if (k in obj) delete obj[k]; });
    ["need_compress", "should_compress", "enable_compress", "compress_enabled"]
      .forEach((k) => { if (k in obj) obj[k] = false; });
  }

  function removeTranscodeFields(obj) {
    if (!obj || typeof obj !== "object") return;
    [
      "transcode_info", "server_transcode", "transcode_type", "transcode_params",
      "transcode_settings", "auto_transcode", "server_side_encode", "server_encode_params",
    ].forEach((k) => { if (k in obj) delete obj[k]; });
    ["need_transcode", "should_transcode", "enable_transcode"]
      .forEach((k) => { if (k in obj) obj[k] = false; });
  }

  function removeWatermarkFields(obj) {
    if (!obj || typeof obj !== "object") return;
    [
      "watermark_info", "watermark", "watermark_type", "add_watermark",
      "watermark_params", "watermark_enabled", "enable_watermark", "watermark_config",
    ].forEach((k) => { if (k in obj) delete obj[k]; });
  }

  function forceMaxQualityParams(obj) {
    if (!obj) return;
    ["quality_level", "encode_quality", "video_quality", "target_quality", "quality"]
      .forEach((k) => {
        if (k in obj) obj[k] = typeof obj[k] === "string" ? "high" : 0;
      });
    [
      "quality_downgrade", "auto_quality", "adaptive_quality",
      "quality_optimize", "quality_adapt", "degrade_quality",
    ].forEach((k) => { if (k in obj) delete obj[k]; });
  }

  function deepScanAndFix(obj, depth) {
    if (!obj || typeof obj !== "object" || depth > 6) return;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (["fps", "frame_rate", "framerate"].includes(key) &&
          typeof val === "number" && val > 0 && val < FPS) {
        obj[key] = FPS;
      }
      if (["short_side", "resolution"].includes(key) &&
          typeof val === "number" && val > 0 && val < SHORT) {
        obj[key] = SHORT;
      }
      if (val && typeof val === "object") deepScanAndFix(val, depth + 1);
    }
  }

  function processPayload(data) {
    if (!data || typeof data !== "object") return null;

    if (data?.post_common_info?.post_type === 2) data.post_common_info.post_type = 3;
    if (data.cloud_edit_is_use_video_canvas !== undefined) data.cloud_edit_is_use_video_canvas = false;
    if (data.enter_post_page_from !== undefined) data.enter_post_page_from = 1;
    if ("canvas_config" in data) delete data.canvas_config;

    data?.feature_common_info_list?.forEach((item) => {
      if (item?.vedit_common_info?.draft !== undefined) delete item.vedit_common_info.draft;
    });
    data?.single_post_req_list?.forEach((req) => {
      if (req?.single_post_feature_info?.vedit_segment_info) {
        delete req.single_post_feature_info.vedit_segment_info;
      }
    });

    const viPaths = [
      data?.video_info,
      data?.post_common_info?.video_info,
      data?.media_info?.video_info,
      data?.upload_info?.video_info,
      data?.video,
      data?.media?.video,
    ].filter(Boolean);

    data?.single_post_req_list?.forEach((req) => {
      const fi = req?.single_post_feature_info;
      if (fi?.video_info) viPaths.push(fi.video_info);
      if (fi?.media_info?.video_info) viPaths.push(fi.media_info.video_info);
    });

    viPaths.forEach((vi) => {
      forceResolution(vi);
      forceFPS(vi);
      forceBitrate(vi);
      removeCompressionFields(vi);
      forceMaxQualityParams(vi);
    });

    removeCompressionFields(data);
    removeTranscodeFields(data);
    removeWatermarkFields(data);
    forceMaxQualityParams(data);

    [
      "cover_generation_params", "cover_info", "auto_cover",
      "cover_generation_type", "need_cover_generation",
    ].forEach((k) => { if (k in data) delete data[k]; });

    data?.single_post_req_list?.forEach((req) => {
      removeCompressionFields(req);
      removeTranscodeFields(req);
      removeWatermarkFields(req);
      const fi = req?.single_post_feature_info;
      if (fi) {
        removeCompressionFields(fi);
        removeTranscodeFields(fi);
        removeWatermarkFields(fi);
      }
    });

    deepScanAndFix(data, 0);
    return JSON.stringify(data);
  }

  function isUploadEndpoint(url) {
    return typeof url === "string" &&
      (url.includes("project/post") || url.includes("/publish") || url.includes("/post/publish"));
  }

  function bypassOn() {
    return window.__pageSettings?.injectEnabled !== false;
  }

  const _origCreateObjectURL = URL.createObjectURL.bind(URL);
  const dummyVideoURL = _origCreateObjectURL(
    new Blob([new Uint8Array(8)], { type: "application/octet-stream" }),
  );

  Object.defineProperty(URL, "createObjectURL", {
    get: () => (obj) => {
      const method1On = bypassOn() && window.__pageSettings?.method1 === true;
      const onUploadPage =
        window.location.href.includes("tiktokstudio") ||
        window.location.href.includes("/upload");
      if (method1On && onUploadPage && obj instanceof Blob && obj.type?.startsWith("video/")) {
        return dummyVideoURL;
      }
      return _origCreateObjectURL(obj);
    },
    configurable: true,
  });

  window.fetch = new Proxy(window.fetch, {
    apply(target, thisArg, [url, config = {}, ...rest]) {
      if (bypassOn() && isUploadEndpoint(url) && config?.body) {
        try {
          const parsed = JSON.parse(config.body);
          config.body = processPayload(parsed);
        } catch (_) {}
      }
      return Reflect.apply(target, thisArg, [url, config, ...rest]);
    },
  });

  const _origOpen = XMLHttpRequest.prototype.open;
  const _origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__Url = url;
    return _origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (bypassOn() && isUploadEndpoint(this.__Url) && typeof body === "string") {
      try {
        const parsed = JSON.parse(body);
        body = processPayload(parsed);
      } catch (_) {}
    }
    return _origSend.call(this, body);
  };

  const _origStringify = JSON.stringify;
  JSON.stringify = function (value, ...rest) {
    const href = window.location.href;
    if (bypassOn() &&
        (href.includes("tiktokstudio") || href.includes("/upload")) &&
        value && typeof value === "object") {
      const hasTriggerKeys =
        value.single_post_req_list || value.vedit_common_info || value.post_common_info;
      if (hasTriggerKeys) {
        try { processPayload(value); } catch (_) {}
      }
    }
    return _origStringify.call(this, value, ...rest);
  };
})();
