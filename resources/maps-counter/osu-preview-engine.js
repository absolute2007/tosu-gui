"use strict";
var TosuOsuPreview = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/lib/osu-preview.ts
  var osu_preview_exports = {};
  __export(osu_preview_exports, {
    IDKE_COMBO_COLORS: () => IDKE_COMBO_COLORS,
    approachMs: () => approachMs,
    circleRadius: () => circleRadius,
    createPreviewRuntime: () => createPreviewRuntime,
    drawPreviewFrame: () => drawPreviewFrame,
    parseOsu: () => parseOsu,
    pointAlongPath: () => pointAlongPath,
    resetPreviewRuntime: () => resetPreviewRuntime
  });
  var IDKE_COMBO_COLORS = [
    "rgb(26, 116, 242)",
    // Combo1: Blue
    "rgb(164, 32, 240)",
    // Combo2: Purple
    "rgb(37, 185, 239)",
    // Combo3: Cyan
    "rgb(23, 209, 116)",
    // Combo4: Green
    "rgb(255, 75, 255)"
    // Combo5: Pink
  ];
  var PLAY_W = 512;
  var PLAY_H = 384;
  function approachMs(ar) {
    if (ar < 5) return 1800 - ar * 120;
    return 1200 - (ar - 5) * 150;
  }
  function circleRadius(cs) {
    return Math.max(8, 54.4 - 4.48 * cs);
  }
  function createPreviewRuntime(volume = 0.65) {
    return {
      fired: /* @__PURE__ */ new Set(),
      cursor: { x: PLAY_W / 2, y: PLAY_H / 2 },
      trail: [],
      volume: Math.min(1, Math.max(0, volume)),
      audio: null,
      lastT: -1,
      judgments: []
    };
  }
  function resetPreviewRuntime(rt, volume) {
    rt.fired.clear();
    rt.cursor = { x: PLAY_W / 2, y: PLAY_H / 2 };
    rt.trail = [];
    rt.lastT = -1;
    rt.judgments = [];
    if (volume != null) rt.volume = Math.min(1, Math.max(0, volume));
  }
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }
  function clampPlayfield(p) {
    return {
      x: clamp(p.x, 0, PLAY_W),
      y: clamp(p.y, 0, PLAY_H)
    };
  }
  function pathMetrics(path) {
    const cumLens = [0];
    let pathLen = 0;
    for (let i = 1; i < path.length; i++) {
      pathLen += dist(path[i - 1], path[i]);
      cumLens.push(pathLen);
    }
    return { pathLen, cumLens };
  }
  function pointAlongPath(path, cumLens, pathLen, d) {
    if (!path.length) return { x: PLAY_W / 2, y: PLAY_H / 2 };
    if (path.length === 1 || pathLen <= 0) return path[0];
    const target = Math.min(pathLen, Math.max(0, d));
    let i = 1;
    while (i < cumLens.length && cumLens[i] < target) i++;
    const a = path[i - 1];
    const b = path[Math.min(i, path.length - 1)];
    const segStart = cumLens[i - 1];
    const segEnd = cumLens[Math.min(i, cumLens.length - 1)];
    const seg = segEnd - segStart || 1;
    return lerp(a, b, (target - segStart) / seg);
  }
  function sampleLinear(points, stepsPerSeg = 10) {
    if (points.length < 2) return points.slice();
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      for (let s = 1; s <= stepsPerSeg; s++) {
        out.push(lerp(points[i - 1], points[i], s / stepsPerSeg));
      }
    }
    return out;
  }
  function sampleBezierSegment(ctrl, steps) {
    if (ctrl.length === 0) return [];
    if (ctrl.length === 1) return [ctrl[0]];
    if (ctrl.length === 2) return sampleLinear(ctrl, steps);
    const out = [];
    for (let s = 0; s <= steps; s++) {
      let pts = ctrl.slice();
      const t = s / steps;
      while (pts.length > 1) {
        const next = [];
        for (let i = 0; i < pts.length - 1; i++) {
          next.push(lerp(pts[i], pts[i + 1], t));
        }
        pts = next;
      }
      out.push(pts[0]);
    }
    return out;
  }
  function sampleBezier(points) {
    if (points.length < 3) return sampleLinear(points, 20);
    const out = [];
    let segStart = 0;
    for (let i = 0; i < points.length - 1; i++) {
      if (i > segStart && points[i].x === points[i + 1].x && points[i].y === points[i + 1].y) {
        const seg = points.slice(segStart, i + 1);
        const sampled = sampleBezierSegment(seg, Math.max(10, seg.length * 8));
        if (out.length) sampled.shift();
        out.push(...sampled);
        segStart = i + 1;
      }
    }
    if (segStart < points.length) {
      const seg = points.slice(segStart);
      const sampled = sampleBezierSegment(seg, Math.max(10, seg.length * 8));
      if (out.length && sampled.length) sampled.shift();
      out.push(...sampled);
    }
    return out.length ? out : sampleLinear(points, 20);
  }
  function sampleCircumscribedCircle(p1, p2, p3) {
    const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    if (Math.abs(d) < 1e-4) return sampleLinear([p1, p2, p3], 20);
    const p1Sq = p1.x * p1.x + p1.y * p1.y;
    const p2Sq = p2.x * p2.x + p2.y * p2.y;
    const p3Sq = p3.x * p3.x + p3.y * p3.y;
    const cx = (p1Sq * (p2.y - p3.y) + p2Sq * (p3.y - p1.y) + p3Sq * (p1.y - p2.y)) / d;
    const cy = (p1Sq * (p3.x - p2.x) + p2Sq * (p1.x - p3.x) + p3Sq * (p2.x - p1.x)) / d;
    const r = Math.hypot(p1.x - cx, p1.y - cy);
    const a1 = Math.atan2(p1.y - cy, p1.x - cx);
    const a2 = Math.atan2(p2.y - cy, p2.x - cx);
    const a3 = Math.atan2(p3.y - cy, p3.x - cx);
    let da12 = a2 - a1;
    let da23 = a3 - a2;
    while (da12 > Math.PI) da12 -= Math.PI * 2;
    while (da12 < -Math.PI) da12 += Math.PI * 2;
    while (da23 > Math.PI) da23 -= Math.PI * 2;
    while (da23 < -Math.PI) da23 += Math.PI * 2;
    if (Math.sign(da12) !== Math.sign(da23)) return sampleLinear([p1, p2, p3], 20);
    const totalAngle = da12 + da23;
    const steps = Math.max(15, Math.ceil(Math.abs(totalAngle) * r / 4));
    const out = [];
    for (let s = 0; s <= steps; s++) {
      const a = a1 + totalAngle * s / steps;
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return out;
  }
  function sampleCatmullSegment(p0, p1, p2, p3, steps = 12) {
    const out = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out.push({ x, y });
    }
    return out;
  }
  function sampleCatmull(points) {
    if (points.length < 3) return sampleLinear(points, 20);
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i + 2 < points.length ? points[i + 2] : p2;
      const seg = sampleCatmullSegment(p0, p1, p2, p3, 14);
      if (out.length && seg.length) seg.shift();
      out.push(...seg);
    }
    return out.length ? out : sampleLinear(points, 20);
  }
  function buildCurve(curveType, points) {
    if (points.length <= 1) return points.slice();
    const kind = curveType.toUpperCase()[0] || "L";
    if (kind === "L") return sampleLinear(points, 10);
    if (kind === "P" && points.length === 3) return sampleCircumscribedCircle(points[0], points[1], points[2]);
    if (kind === "C") return sampleCatmull(points);
    return sampleBezier(points);
  }
  function fitPathLength(path, targetLen) {
    if (path.length < 2 || targetLen <= 0) return path;
    const { pathLen, cumLens } = pathMetrics(path);
    if (pathLen <= 0) return path;
    if (Math.abs(pathLen - targetLen) < 1) return path;
    if (targetLen < pathLen) {
      const out = [path[0]];
      for (let i = 1; i < path.length; i++) {
        if (cumLens[i] >= targetLen) {
          const segStart = cumLens[i - 1];
          const segEnd = cumLens[i];
          const seg = segEnd - segStart || 1;
          const t = (targetLen - segStart) / seg;
          out.push(lerp(path[i - 1], path[i], t));
          break;
        }
        out.push(path[i]);
      }
      return out;
    }
    const last = path[path.length - 1];
    const prev = path[path.length - 2];
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const need = targetLen - pathLen;
    return path.concat([{ x: last.x + dx / len * need, y: last.y + dy / len * need }]);
  }
  function parseTimingPoints(lines) {
    const out = [];
    let section = "";
    let lastBeat = 500;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("//")) continue;
      if (line.startsWith("[") && line.endsWith("]")) {
        section = line.slice(1, -1).toLowerCase();
        continue;
      }
      if (section !== "timingpoints") continue;
      const p = line.split(",");
      if (p.length < 2) continue;
      const time = parseFloat(p[0]);
      const beatLength = parseFloat(p[1]);
      const uninherited = p.length < 7 ? 1 : parseInt(p[6], 10);
      if (!Number.isFinite(time) || !Number.isFinite(beatLength)) continue;
      if (uninherited === 1 || beatLength > 0) {
        lastBeat = beatLength > 0 ? beatLength : lastBeat;
        out.push({ time, beatLength: lastBeat, sv: 1 });
      } else {
        const sv = Math.max(0.1, Math.min(10, -100 / beatLength));
        out.push({ time, beatLength: lastBeat, sv });
      }
    }
    out.sort((a, b) => a.time - b.time);
    if (!out.length) out.push({ time: 0, beatLength: 500, sv: 1 });
    return out;
  }
  function timingAt(list, t) {
    let cur = list[0];
    for (let i = 0; i < list.length; i++) {
      if (list[i].time <= t) cur = list[i];
      else break;
    }
    return cur;
  }
  function parseOsu(text) {
    const lines = String(text || "").split(/\r?\n/);
    let section = "";
    let previewTime = 0;
    let ar = 9;
    let cs = 4;
    let modeNum = 0;
    let sliderMultiplier = 1.4;
    let hasAR = false;
    const timing = parseTimingPoints(lines);
    const objects = [];
    let comboNumber = 0;
    let comboIndex = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("//")) continue;
      if (line.startsWith("[") && line.endsWith("]")) {
        section = line.slice(1, -1).toLowerCase();
        continue;
      }
      if (section === "general") {
        if (line.startsWith("PreviewTime:")) previewTime = parseInt(line.split(":")[1], 10) || 0;
        if (line.startsWith("Mode:")) modeNum = parseInt(line.split(":")[1], 10) || 0;
      } else if (section === "difficulty") {
        if (line.startsWith("ApproachRate:")) {
          ar = parseFloat(line.split(":")[1]) || 9;
          hasAR = true;
        }
        if (line.startsWith("CircleSize:")) cs = parseFloat(line.split(":")[1]) || 4;
        if (line.startsWith("SliderMultiplier:")) sliderMultiplier = parseFloat(line.split(":")[1]) || 1.4;
        if (line.startsWith("OverallDifficulty:") && !hasAR) {
          ar = parseFloat(line.split(":")[1]) || ar;
        }
      } else if (section === "hitobjects") {
        const p = line.split(",");
        if (p.length < 4) continue;
        let x = parseFloat(p[0]);
        let y = parseFloat(p[1]);
        const t = parseInt(p[2], 10);
        const type = parseInt(p[3], 10) || 0;
        const hitSound = parseInt(p[4], 10) || 0;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(t)) continue;
        const clamped = clampPlayfield({ x, y });
        x = clamped.x;
        y = clamped.y;
        if (type & 4) {
          comboIndex = (comboIndex + 1 + (type >> 4 & 7)) % IDKE_COMBO_COLORS.length;
          comboNumber = 1;
        } else {
          comboNumber += 1;
        }
        const color = IDKE_COMBO_COLORS[comboIndex % IDKE_COMBO_COLORS.length];
        if (type & 8) {
          const endTime = parseInt(p[5], 10) || t + 1e3;
          objects.push({ kind: "spinner", t, endTime });
          continue;
        }
        if (type & 2) {
          const curveRaw = p[5] || "L";
          const slides = Math.max(1, parseInt(p[6], 10) || 1);
          const pixelLength = parseFloat(p[7]) || 0;
          const pipe = curveRaw.split("|");
          const curveType = pipe[0] || "B";
          const cps = [{ x, y }];
          for (let i = 1; i < pipe.length; i++) {
            const xy = pipe[i].split(":");
            if (xy.length < 2) continue;
            const cx = parseFloat(xy[0]);
            const cy = parseFloat(xy[1]);
            if (Number.isFinite(cx) && Number.isFinite(cy)) {
              cps.push({
                x: clamp(cx, -PLAY_W * 0.15, PLAY_W * 1.15),
                y: clamp(cy, -PLAY_H * 0.15, PLAY_H * 1.15)
              });
            }
          }
          let path = buildCurve(curveType, cps);
          if (pixelLength > 0) path = fitPathLength(path, pixelLength);
          if (path.length < 2) path = [{ x, y }, { x: x + 40, y }];
          const { pathLen, cumLens } = pathMetrics(path);
          const tm = timingAt(timing, t);
          const pxPerBeat = sliderMultiplier * 100 * tm.sv;
          const oneSlide = pxPerBeat > 0 ? Math.max(pathLen, 1) / pxPerBeat * tm.beatLength : 500;
          const endTime = Math.round(t + oneSlide * slides);
          objects.push({
            kind: "slider",
            x,
            y,
            t,
            endTime,
            slides,
            path,
            pathLen,
            cumLens,
            hitSound,
            comboIndex,
            comboNumber,
            color
          });
        } else {
          objects.push({ kind: "circle", x, y, t, hitSound, comboIndex, comboNumber, color });
        }
      }
    }
    objects.sort((a, b) => a.t - b.t);
    if (previewTime <= 0 && objects.length) {
      previewTime = Math.max(0, objects[0].t - 500);
    }
    return { previewTime, ar, cs, mode: modeNum, objects };
  }
  var skinImages = {
    cursor: null,
    cursortrail: null,
    hitcircle: null,
    hitcircleoverlay: null,
    approachcircle: null,
    reversearrow: null,
    sliderb: null,
    hit300: null,
    hit100: null,
    hit50: null,
    hit0: null,
    digits: []
  };
  var tintedCircles = /* @__PURE__ */ new Map();
  var tintedApproaches = /* @__PURE__ */ new Map();
  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
  var skinLoadingPromise = null;
  function ensureSkinLoaded() {
    if (skinLoadingPromise) return skinLoadingPromise;
    const base = "./skin/";
    skinLoadingPromise = (async () => {
      const [
        cursor,
        cursortrail,
        hitcircle,
        hitcircleoverlay,
        approachcircle,
        reversearrow,
        sliderb,
        hit300,
        hit100,
        hit50,
        hit0
      ] = await Promise.all([
        loadImg(`${base}cursor.png`).catch(() => null),
        loadImg(`${base}cursortrail.png`).catch(() => null),
        loadImg(`${base}hitcircle.png`).catch(() => null),
        loadImg(`${base}hitcircleoverlay.png`).catch(() => null),
        loadImg(`${base}approachcircle.png`).catch(() => null),
        loadImg(`${base}reversearrow.png`).catch(() => null),
        loadImg(`${base}sliderb0.png`).catch(() => null),
        loadImg(`${base}hit300.png`).catch(() => null),
        loadImg(`${base}hit100.png`).catch(() => null),
        loadImg(`${base}hit50.png`).catch(() => null),
        loadImg(`${base}hit0.png`).catch(() => null)
      ]);
      skinImages.cursor = cursor;
      skinImages.cursortrail = cursortrail;
      skinImages.hitcircle = hitcircle;
      skinImages.hitcircleoverlay = hitcircleoverlay;
      skinImages.approachcircle = approachcircle;
      skinImages.reversearrow = reversearrow;
      skinImages.sliderb = sliderb;
      skinImages.hit300 = hit300;
      skinImages.hit100 = hit100;
      skinImages.hit50 = hit50;
      skinImages.hit0 = hit0;
      const digits = [];
      for (let i = 0; i <= 9; i++) {
        digits.push(await loadImg(`${base}default-${i}.png`).catch(() => null));
      }
      skinImages.digits = digits;
      if (hitcircle) {
        for (const col of IDKE_COMBO_COLORS) {
          const c = document.createElement("canvas");
          c.width = hitcircle.width || 128;
          c.height = hitcircle.height || 128;
          const ctx = c.getContext("2d");
          if (ctx) {
            ctx.drawImage(hitcircle, 0, 0, c.width, c.height);
            ctx.globalCompositeOperation = "source-in";
            ctx.fillStyle = col;
            ctx.fillRect(0, 0, c.width, c.height);
            if (hitcircleoverlay) {
              ctx.globalCompositeOperation = "source-over";
              ctx.drawImage(hitcircleoverlay, 0, 0, c.width, c.height);
            }
            tintedCircles.set(col, c);
          }
        }
      }
      if (approachcircle) {
        for (const col of IDKE_COMBO_COLORS) {
          const c = document.createElement("canvas");
          c.width = approachcircle.width || 128;
          c.height = approachcircle.height || 128;
          const ctx = c.getContext("2d");
          if (ctx) {
            ctx.drawImage(approachcircle, 0, 0, c.width, c.height);
            ctx.globalCompositeOperation = "source-in";
            ctx.fillStyle = col;
            ctx.fillRect(0, 0, c.width, c.height);
            tintedApproaches.set(col, c);
          }
        }
      }
    })();
    return skinLoadingPromise;
  }
  var cachedBuffers = null;
  var loadingBuffersPromise = null;
  async function loadSample(ctx, url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return await ctx.decodeAudioData(arr);
    } catch {
      return null;
    }
  }
  async function loadHitSoundBuffers(ctx) {
    if (cachedBuffers) return cachedBuffers;
    if (loadingBuffersPromise) return loadingBuffersPromise;
    loadingBuffersPromise = (async () => {
      const base = "./skin/";
      const [normal, whistle, finish, clap] = await Promise.all([
        loadSample(ctx, `${base}normal-hitnormal.wav`).catch(() => null),
        loadSample(ctx, `${base}normal-hitwhistle.wav`).catch(() => null),
        loadSample(ctx, `${base}normal-hitfinish.wav`).catch(() => null),
        loadSample(ctx, `${base}normal-hitclap.wav`).catch(() => null)
      ]);
      cachedBuffers = { normal, whistle, finish, clap };
      return cachedBuffers;
    })();
    return loadingBuffersPromise;
  }
  function playBuffer(ctx, buf, vol) {
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0);
    } catch {
    }
  }
  function ensureAudio(rt) {
    try {
      if (!rt.audio) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        rt.audio = new AC();
      }
      if (rt.audio.state === "suspended") void rt.audio.resume();
      return rt.audio;
    } catch {
      return null;
    }
  }
  function playHitSound(rt, hitSound) {
    if (rt.volume <= 1e-3) return;
    const ctx = ensureAudio(rt);
    if (!ctx) return;
    void loadHitSoundBuffers(ctx);
    const vol = Math.min(1, Math.max(0, rt.volume));
    if (cachedBuffers && cachedBuffers.normal) {
      playBuffer(ctx, cachedBuffers.normal, 0.55 * vol);
      if (hitSound & 2 && cachedBuffers.whistle) {
        playBuffer(ctx, cachedBuffers.whistle, 0.55 * vol);
      }
      if (hitSound & 4 && cachedBuffers.finish) {
        playBuffer(ctx, cachedBuffers.finish, 0.65 * vol);
      }
      if (hitSound & 8 && cachedBuffers.clap) {
        playBuffer(ctx, cachedBuffers.clap, 0.6 * vol);
      }
    }
  }
  function fireHits(data, t, rt) {
    if (rt.lastT < 0) rt.lastT = t;
    const from = rt.lastT;
    const to = t;
    rt.lastT = t;
    if (to < from) return;
    data.objects.forEach((o, i) => {
      if (o.kind === "circle") {
        const key = `c${i}`;
        if (o.t >= from && o.t <= to + 0.5 && !rt.fired.has(key)) {
          rt.fired.add(key);
          playHitSound(rt, o.hitSound);
          rt.judgments.push({ x: o.x, y: o.y, t: o.t, type: "300" });
        }
      } else if (o.kind === "slider") {
        const span = Math.max(1, o.endTime - o.t);
        const slides = Math.max(1, o.slides || 1);
        for (let s = 0; s <= slides; s++) {
          const slideT = o.t + s * (span / slides);
          const key = `sl_${i}_${s}`;
          if (slideT >= from && slideT <= to + 0.5 && !rt.fired.has(key)) {
            rt.fired.add(key);
            playHitSound(rt, o.hitSound);
            if (s === slides) {
              const endPos = sliderBallPos(o, o.endTime);
              rt.judgments.push({ x: endPos.x, y: endPos.y, t: o.endTime, type: "300" });
            }
          }
        }
      }
    });
  }
  function sliderBallPos(o, t) {
    const span = Math.max(1, o.endTime - o.t);
    const one = span / o.slides;
    let local = (t - o.t) / one;
    if (local < 0) return { x: o.x, y: o.y };
    const slide = Math.floor(local);
    local = local - slide;
    if (slide % 2 === 1) local = 1 - local;
    local = clamp(local, 0, 1);
    return pointAlongPath(o.path, o.cumLens, o.pathLen, local * o.pathLen);
  }
  function buildAnchors(objects) {
    const a = [];
    for (const o of objects) {
      if (o.kind === "circle") {
        a.push({ t: o.t, p: { x: o.x, y: o.y } });
      } else if (o.kind === "slider") {
        a.push({ t: o.t, p: { x: o.x, y: o.y } });
        a.push({ t: o.endTime, p: sliderBallPos(o, o.endTime) });
      } else {
        a.push({ t: o.t, p: { x: PLAY_W / 2, y: PLAY_H / 2 } });
        a.push({ t: o.endTime, p: { x: PLAY_W / 2, y: PLAY_H / 2 } });
      }
    }
    a.sort((x, y) => x.t - y.t);
    return a;
  }
  function easeInOutCubic(u) {
    const t = clamp(u, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function autoplayTarget(data, t) {
    for (const o of data.objects) {
      if (o.kind === "slider" && t >= o.t && t <= o.endTime) {
        return sliderBallPos(o, t);
      }
      if (o.kind === "spinner" && t >= o.t && t <= o.endTime) {
        return { x: PLAY_W / 2, y: PLAY_H / 2 };
      }
    }
    const anchors = buildAnchors(data.objects);
    if (!anchors.length) return { x: PLAY_W / 2, y: PLAY_H / 2 };
    if (t <= anchors[0].t) {
      const first = anchors[0];
      const lead = 400;
      const p = first.t - t;
      if (p > lead) return { x: PLAY_W / 2, y: PLAY_H / 2 };
      const u = easeInOutCubic(1 - p / lead);
      return lerp({ x: PLAY_W / 2, y: PLAY_H / 2 }, first.p, u);
    }
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      if (t >= a.t && t <= b.t) {
        const span = Math.max(1, b.t - a.t);
        const u = (t - a.t) / span;
        const shaped = easeInOutCubic(Math.pow(u, 0.9));
        return lerp(a.p, b.p, shaped);
      }
    }
    return anchors[anchors.length - 1].p;
  }
  function updateCursor(data, t, rt) {
    const target = autoplayTarget(data, t);
    const k = 0.55;
    rt.cursor = {
      x: rt.cursor.x + (target.x - rt.cursor.x) * k,
      y: rt.cursor.y + (target.y - rt.cursor.y) * k
    };
    rt.trail.push({ x: rt.cursor.x, y: rt.cursor.y, t });
    while (rt.trail.length > 24 || rt.trail.length > 0 && t - rt.trail[0].t > 220) {
      rt.trail.shift();
    }
  }
  function normalizeOsuPos(p, insetOsu) {
    const inset = clamp(insetOsu, 0, Math.min(PLAY_W, PLAY_H) * 0.35);
    const usableW = Math.max(1, PLAY_W - 2 * inset);
    const usableH = Math.max(1, PLAY_H - 2 * inset);
    const cx = clamp(p.x, 0, PLAY_W);
    const cy = clamp(p.y, 0, PLAY_H);
    return {
      x: inset + cx / PLAY_W * usableW,
      y: inset + cy / PLAY_H * usableH
    };
  }
  function makeFieldLayout(canvasW, canvasH, cs) {
    const rOsu = circleRadius(cs);
    const insetOsu = rOsu + 3;
    const scale = Math.min(canvasW / PLAY_W, canvasH / PLAY_H);
    const pfW = PLAY_W * scale;
    const pfH = PLAY_H * scale;
    const ox = (canvasW - pfW) / 2;
    const oy = (canvasH - pfH) / 2;
    const rPx = rOsu * scale;
    const pad = 1.5;
    const scr = (p) => {
      const n = normalizeOsuPos(p, insetOsu);
      return { x: ox + n.x * scale, y: oy + n.y * scale };
    };
    const maxRadiusAt = (sx, sy) => {
      const left = sx - ox - pad;
      const right = ox + pfW - sx - pad;
      const top = sy - oy - pad;
      const bottom = oy + pfH - sy - pad;
      return Math.max(2, Math.min(left, right, top, bottom));
    };
    return { ox, oy, scale, pfW, pfH, rPx, insetOsu, scr, maxRadiusAt };
  }
  function drawDigits(ctx, cx, cy, num, r, alpha) {
    const str = String(num);
    const digits = skinImages.digits;
    const hasSprites = digits.length >= 10 && digits.every((d) => d != null);
    if (hasSprites && digits[0]) {
      const scale = r * 0.85 / (digits[0].height || 40);
      let totalW = 0;
      for (const ch of str) {
        const d = digits[parseInt(ch, 10)];
        if (d) totalW += (d.width - 6) * scale;
      }
      let curX = cx - totalW / 2;
      for (const ch of str) {
        const d = digits[parseInt(ch, 10)];
        if (d) {
          const dw = d.width * scale;
          const dh = d.height * scale;
          ctx.drawImage(d, curX, cy - dh / 2, dw, dh);
          curX += (d.width - 6) * scale;
        }
      }
    } else {
      ctx.fillStyle = `rgba(255,255,255,${(0.95 * alpha).toFixed(3)})`;
      ctx.font = `bold ${Math.max(12, Math.round(r * 0.62))}px system-ui,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(str, cx, cy + 0.5);
    }
  }
  function drawHitCircle(ctx, cx, cy, r, color, alpha, comboNumber, scaleMul = 1) {
    const rr = r * scaleMul;
    if (rr < 1 || alpha < 0.01) return;
    const tinted = tintedCircles.get(color);
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    if (tinted) {
      ctx.drawImage(tinted, cx - rr, cy - rr, rr * 2, rr * 2);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = Math.max(2, rr * 0.08);
      ctx.stroke();
    }
    if (comboNumber > 0 && rr > 7) {
      drawDigits(ctx, cx, cy, comboNumber, rr, alpha);
    }
    ctx.restore();
  }
  function drawApproach(ctx, cx, cy, r, color, alpha, progress, maxR) {
    const p = clamp(progress, 0, 1);
    const ideal = r * (1 + 2.5 * p);
    const apR = Math.min(ideal, Math.max(r * 1.02, maxR));
    const tinted = tintedApproaches.get(color);
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    if (tinted) {
      ctx.drawImage(tinted, cx - apR, cy - apR, apR * 2, apR * 2);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, apR, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.8, r * 0.09);
      ctx.stroke();
    }
    ctx.restore();
  }
  function strokePathMapped(ctx, path, layout) {
    if (path.length < 2) return;
    const p0 = layout.scr(path[0]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < path.length; i++) {
      const p = layout.scr(path[i]);
      ctx.lineTo(p.x, p.y);
    }
  }
  function drawSliderBody(ctx, o, layout, r, alpha) {
    if (o.path.length < 2 || alpha < 0.02) return;
    const border = r * 2;
    const body = r * 1.74;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokePathMapped(ctx, o.path, layout);
    ctx.strokeStyle = `rgba(120,120,120,${(0.9 * alpha).toFixed(3)})`;
    ctx.lineWidth = border;
    ctx.stroke();
    strokePathMapped(ctx, o.path, layout);
    ctx.strokeStyle = `rgba(3,3,12,${(0.85 * alpha).toFixed(3)})`;
    ctx.lineWidth = body;
    ctx.stroke();
    const end = layout.scr(o.path[o.path.length - 1]);
    const endR = Math.min(r * 0.92, layout.maxRadiusAt(end.x, end.y));
    ctx.beginPath();
    ctx.arc(end.x, end.y, endR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(3,3,12,${(0.85 * alpha).toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(120,120,120,${(0.85 * alpha).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.stroke();
    if (o.slides > 1 && skinImages.reversearrow) {
      const arrow = skinImages.reversearrow;
      const pPrev = layout.scr(o.path[Math.max(0, o.path.length - 3)]);
      const angle = Math.atan2(pPrev.y - end.y, pPrev.x - end.x);
      ctx.save();
      ctx.translate(end.x, end.y);
      ctx.rotate(angle);
      const arSize = endR * 1.6;
      ctx.drawImage(arrow, -arSize / 2, -arSize / 2, arSize, arSize);
      ctx.restore();
    }
    ctx.restore();
  }
  function drawSliderBall(ctx, cx, cy, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    if (skinImages.sliderb) {
      const img = skinImages.sliderb;
      const size = r * 1.8;
      ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.54, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();
  }
  function drawSpinner(ctx, layout, t, o, alpha) {
    const c = layout.scr({ x: PLAY_W / 2, y: PLAY_H / 2 });
    const R = Math.min(layout.pfW, layout.pfH) * 0.28;
    const progress = clamp((t - o.t) / Math.max(1, o.endTime - o.t), 0, 1);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${(0.25 * alpha).toFixed(3)})`;
    ctx.lineWidth = 4 * layout.scale;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.x, c.y, R, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.strokeStyle = `rgba(26,116,242,${(0.9 * alpha).toFixed(3)})`;
    ctx.lineWidth = 6 * layout.scale;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }
  function drawCursor(ctx, layout, rt, nowT) {
    const cursorImg = skinImages.cursor;
    const trailImg = skinImages.cursortrail;
    for (let i = 0; i < rt.trail.length; i++) {
      const pt = rt.trail[i];
      const p = layout.scr(pt);
      const age = nowT - pt.t;
      if (age > 200) continue;
      const a = (1 - age / 200) * 0.55;
      ctx.save();
      ctx.globalAlpha = a;
      if (trailImg) {
        const size = layout.rPx * 0.65;
        ctx.drawImage(trailImg, p.x - size / 2, p.y - size / 2, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, layout.rPx * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fill();
      }
      ctx.restore();
    }
    const c = layout.scr(rt.cursor);
    ctx.save();
    if (cursorImg) {
      const size = layout.rPx * 0.95;
      ctx.drawImage(cursorImg, c.x - size / 2, c.y - size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(c.x, c.y, layout.rPx * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();
    }
    ctx.restore();
  }
  function drawJudgments(ctx, layout, rt, nowT) {
    const hit300 = skinImages.hit300;
    if (!hit300) return;
    for (let i = rt.judgments.length - 1; i >= 0; i--) {
      const j = rt.judgments[i];
      const age = nowT - j.t;
      if (age > 350) {
        rt.judgments.splice(i, 1);
        continue;
      }
      const alpha = (1 - age / 350) * 0.85;
      const scale = 1 + age / 350 * 0.15;
      const p = layout.scr({ x: j.x, y: j.y });
      const size = layout.rPx * 1.1 * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(hit300, p.x - size / 2, p.y - size / 2 - age / 350 * 8, size, size);
      ctx.restore();
    }
  }
  function circleAnim(t, hitT, preempt) {
    const dt = hitT - t;
    if (dt > preempt) return null;
    const fadeInTime = Math.min(preempt, 400);
    if (dt > 0) {
      const lived = preempt - dt;
      const fadeIn = clamp(lived / fadeInTime, 0, 1);
      const alpha2 = fadeIn * fadeIn * (3 - 2 * fadeIn);
      return { alpha: alpha2, scale: 1, approach: dt / preempt, showBody: true, showApproach: true };
    }
    const age = t - hitT;
    const burstFade = 140;
    if (age > burstFade) return null;
    const p = age / burstFade;
    const alpha = (1 - p) * (1 - p);
    const scale = 1 + 0.3 * p;
    return { alpha, scale, approach: 0, showBody: true, showApproach: false };
  }
  function sliderAnim(t, o, preempt) {
    const appear = o.t - preempt;
    const gone = o.endTime + 160;
    if (t < appear || t > gone) return null;
    const fadeInTime = Math.min(preempt, 400);
    if (t < o.t) {
      const lived = t - appear;
      const fadeIn = clamp(lived / fadeInTime, 0, 1);
      const alpha2 = fadeIn * fadeIn * (3 - 2 * fadeIn);
      return {
        alpha: alpha2,
        headScale: 1,
        approach: (o.t - t) / preempt,
        showApproach: true,
        showHead: true,
        showBall: false,
        bodyAlpha: alpha2
      };
    }
    if (t <= o.endTime) {
      return {
        alpha: 1,
        headScale: 1,
        approach: 0,
        showApproach: false,
        showHead: true,
        showBall: true,
        bodyAlpha: 1
      };
    }
    const age = t - o.endTime;
    const p = age / 160;
    const alpha = (1 - p) * (1 - p);
    return {
      alpha,
      headScale: 1 + 0.2 * p,
      approach: 0,
      showApproach: false,
      showHead: true,
      showBall: false,
      bodyAlpha: alpha
    };
  }
  function drawPreviewFrame(ctx, data, canvasW, canvasH, t, elapsed, rt) {
    void ensureSkinLoaded();
    const layout = makeFieldLayout(canvasW, canvasH, data.cs);
    const { ox, oy, scale, pfW, pfH } = layout;
    const preempt = approachMs(data.ar);
    const r = layout.rPx;
    const runtime = rt;
    if (runtime) {
      fireHits(data, t, runtime);
      updateCursor(data, t, runtime);
    }
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, canvasW, canvasH);
    const pfGrad = ctx.createLinearGradient(ox, oy, ox, oy + pfH);
    pfGrad.addColorStop(0, "#13131a");
    pfGrad.addColorStop(1, "#0e0e14");
    ctx.fillStyle = pfGrad;
    ctx.fillRect(ox, oy, pfW, pfH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, pfW, pfH);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= PLAY_W; gx += 64) {
      ctx.beginPath();
      ctx.moveTo(ox + gx * scale, oy);
      ctx.lineTo(ox + gx * scale, oy + pfH);
      ctx.stroke();
    }
    for (let gy = 0; gy <= PLAY_H; gy += 64) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + gy * scale);
      ctx.lineTo(ox + pfW, oy + gy * scale);
      ctx.stroke();
    }
    const drawItems = [];
    data.objects.forEach((o, i) => {
      if (o.kind === "circle") {
        const anim = circleAnim(t, o.t, preempt);
        if (!anim) return;
        drawItems.push({ o, i, anim });
      } else if (o.kind === "slider") {
        const anim = sliderAnim(t, o, preempt);
        if (!anim) return;
        drawItems.push({ o, i, anim });
      } else if (o.kind === "spinner") {
        if (t < o.t - 100 || t > o.endTime + 100) return;
        const alpha = t < o.t ? clamp(1 - (o.t - t) / 100, 0, 1) : t > o.endTime ? clamp(1 - (t - o.endTime) / 100, 0, 1) : 1;
        drawItems.push({ o, i, anim: { alpha } });
      }
    });
    for (const item of drawItems) {
      if (item.o.kind === "slider") {
        const sa = item.anim;
        drawSliderBody(ctx, item.o, layout, r, sa.bodyAlpha);
      }
    }
    const solidNotes = drawItems.slice().sort((a, b) => b.o.t - a.o.t || b.i - a.i);
    for (const item of solidNotes) {
      const { o, anim } = item;
      if (o.kind === "circle") {
        const ca = anim;
        if (!ca.showBody) continue;
        const c = layout.scr({ x: o.x, y: o.y });
        const maxR = layout.maxRadiusAt(c.x, c.y);
        const drawR = Math.min(r, maxR / Math.max(ca.scale, 1));
        drawHitCircle(ctx, c.x, c.y, drawR, o.color, ca.alpha, o.comboNumber, ca.scale);
      } else if (o.kind === "slider") {
        const sa = anim;
        const c = layout.scr({ x: o.x, y: o.y });
        const maxR = layout.maxRadiusAt(c.x, c.y);
        const drawR = Math.min(r, maxR / Math.max(sa.headScale, 1));
        if (sa.showHead) {
          drawHitCircle(ctx, c.x, c.y, drawR, o.color, sa.alpha, o.comboNumber, sa.headScale);
        }
        if (sa.showBall) {
          const bp = layout.scr(sliderBallPos(o, t));
          const br = Math.min(r, layout.maxRadiusAt(bp.x, bp.y));
          drawSliderBall(ctx, bp.x, bp.y, br, o.color, sa.alpha);
        }
      } else if (o.kind === "spinner") {
        drawSpinner(ctx, layout, t, o, anim.alpha);
      }
    }
    for (const item of drawItems) {
      const { o, anim } = item;
      if (o.kind === "slider") {
        const sa = anim;
        if (sa.showApproach && sa.approach > 0) {
          const c = layout.scr({ x: o.x, y: o.y });
          const maxR = layout.maxRadiusAt(c.x, c.y);
          const drawR = Math.min(r, maxR / Math.max(sa.headScale, 1));
          drawApproach(ctx, c.x, c.y, drawR, o.color, sa.alpha, sa.approach, maxR);
        }
      } else if (o.kind === "circle") {
        const ca = anim;
        if (ca.showApproach && ca.approach > 0) {
          const c = layout.scr({ x: o.x, y: o.y });
          const maxR = layout.maxRadiusAt(c.x, c.y);
          const drawR = Math.min(r, maxR / Math.max(ca.scale, 1));
          drawApproach(ctx, c.x, c.y, drawR, o.color, ca.alpha, ca.approach, maxR);
        }
      }
    }
    if (runtime) {
      drawJudgments(ctx, layout, runtime, t);
      drawCursor(ctx, layout, runtime, t);
    }
    ctx.restore();
    ctx.fillStyle = "#0a0a0f";
    if (oy > 0.5) ctx.fillRect(0, 0, canvasW, oy);
    if (oy + pfH < canvasH - 0.5) ctx.fillRect(0, oy + pfH, canvasW, canvasH - oy - pfH);
    if (ox > 0.5) ctx.fillRect(0, oy, ox, pfH);
    if (ox + pfW < canvasW - 0.5) ctx.fillRect(ox + pfW, oy, canvasW - ox - pfW, pfH);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + 0.5, oy + 0.5, pfW - 1, pfH - 1);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "12px system-ui,sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`${(t / 1e3).toFixed(1)}s`, 10, 18);
    return elapsed <= 34e3;
  }
  return __toCommonJS(osu_preview_exports);
})();
