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
    approachMs: () => approachMs,
    circleRadius: () => circleRadius,
    createPreviewRuntime: () => createPreviewRuntime,
    drawPreviewFrame: () => drawPreviewFrame,
    parseOsu: () => parseOsu,
    pointAlongPath: () => pointAlongPath,
    resetPreviewRuntime: () => resetPreviewRuntime
  });
  var COMBO_COLORS = [
    "rgb(255, 192, 0)",
    "rgb(0, 202, 0)",
    "rgb(18, 124, 255)",
    "rgb(242, 24, 57)",
    "rgb(180, 90, 255)",
    "rgb(0, 200, 200)"
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
  function createPreviewRuntime(volume = 0.55) {
    return {
      fired: /* @__PURE__ */ new Set(),
      cursor: { x: PLAY_W / 2, y: PLAY_H / 2 },
      trail: [],
      volume: Math.min(1, Math.max(0, volume)),
      audio: null,
      lastT: -1
    };
  }
  function resetPreviewRuntime(rt, volume) {
    rt.fired.clear();
    rt.cursor = { x: PLAY_W / 2, y: PLAY_H / 2 };
    rt.trail = [];
    rt.lastT = -1;
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
        for (let i = 0; i < pts.length - 1; i++) next.push(lerp(pts[i], pts[i + 1], t));
        pts = next;
      }
      out.push(pts[0]);
    }
    return out;
  }
  function sampleBezier(points) {
    if (points.length < 2) return points.slice();
    const out = [];
    let seg = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const prev = seg[seg.length - 1];
      if (prev && Math.abs(prev.x - p.x) < 0.01 && Math.abs(prev.y - p.y) < 0.01) {
        const sampled = sampleBezierSegment(seg, Math.max(14, seg.length * 7));
        if (out.length) sampled.shift();
        out.push(...sampled);
        seg = [p];
      } else {
        seg.push(p);
      }
    }
    if (seg.length) {
      const sampled = sampleBezierSegment(seg, Math.max(14, seg.length * 7));
      if (out.length) sampled.shift();
      out.push(...sampled);
    }
    return out.length ? out : points.slice();
  }
  function sampleCatmull(points, stepsPerSeg = 18) {
    if (points.length < 2) return points.slice();
    const out = [];
    const n = points.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(i - 1, 0)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(i + 2, n - 1)];
      for (let s = 0; s < stepsPerSeg; s++) {
        const t = s / stepsPerSeg;
        const t2 = t * t;
        const t3 = t2 * t;
        out.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    out.push(points[n - 1]);
    return out;
  }
  function samplePerfect(points, steps = 56) {
    if (points.length < 3) return sampleLinear(points);
    const [a, b, c] = points;
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-3) return sampleLinear(points);
    const ux = ((a.x * a.x + a.y * a.y) * (b.y - c.y) + (b.x * b.x + b.y * b.y) * (c.y - a.y) + (c.x * c.x + c.y * c.y) * (a.y - b.y)) / d;
    const uy = ((a.x * a.x + a.y * a.y) * (c.x - b.x) + (b.x * b.x + b.y * b.y) * (a.x - c.x) + (c.x * c.x + c.y * c.y) * (b.x - a.x)) / d;
    const center = { x: ux, y: uy };
    const r = dist(center, a);
    if (!Number.isFinite(r) || r < 0.5 || r > 5e3) return sampleLinear(points);
    const a0 = Math.atan2(a.y - center.y, a.x - center.x);
    const a1 = Math.atan2(b.y - center.y, b.x - center.x);
    let a2 = Math.atan2(c.y - center.y, c.x - center.x);
    const norm = (from, to) => {
      let dlt = to - from;
      while (dlt > Math.PI) dlt -= Math.PI * 2;
      while (dlt < -Math.PI) dlt += Math.PI * 2;
      return dlt;
    };
    const d01 = norm(a0, a1);
    let d02 = norm(a0, a2);
    if (d01 * d02 < 0 || Math.abs(d01) > Math.abs(d02) + 1e-6) {
      d02 = d02 > 0 ? d02 - Math.PI * 2 : d02 + Math.PI * 2;
    }
    a2 = a0 + d02;
    const out = [];
    const total = a2 - a0;
    for (let s = 0; s <= steps; s++) {
      const ang = a0 + total * s / steps;
      out.push({ x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) });
    }
    return out;
  }
  function buildCurve(curveType, points) {
    const t = (curveType || "B").toUpperCase();
    let path;
    if (t === "L") path = sampleLinear(points, 12);
    else if (t === "C") path = sampleCatmull(points);
    else if (t === "P") path = samplePerfect(points);
    else path = sampleBezier(points);
    return path.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({
      x: clamp(p.x, -PLAY_W * 0.25, PLAY_W * 1.25),
      y: clamp(p.y, -PLAY_H * 0.25, PLAY_H * 1.25)
    }));
  }
  function fitPathLength(path, targetLen) {
    if (path.length < 2 || targetLen <= 0) return path;
    const { pathLen, cumLens } = pathMetrics(path);
    if (pathLen <= 0) return path;
    if (pathLen > targetLen) {
      const out = [path[0]];
      for (let i = 1; i < path.length; i++) {
        if (cumLens[i] >= targetLen) {
          out.push(pointAlongPath(path, cumLens, pathLen, targetLen));
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
          comboIndex = (comboIndex + 1 + (type >> 4 & 7)) % COMBO_COLORS.length;
          comboNumber = 1;
        } else {
          comboNumber += 1;
        }
        const color = COMBO_COLORS[comboIndex % COMBO_COLORS.length];
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
          const endTime = t + oneSlide * slides;
          objects.push({
            kind: "slider",
            x,
            y,
            t,
            endTime,
            slides,
            path,
            pathLen: pathLen || 1,
            cumLens,
            hitSound,
            comboIndex,
            comboNumber,
            color
          });
          continue;
        }
        objects.push({
          kind: "circle",
          x,
          y,
          t,
          hitSound,
          comboIndex,
          comboNumber,
          color
        });
      }
    }
    objects.sort((a, b) => a.t - b.t);
    return {
      previewTime: previewTime < 0 ? 0 : previewTime,
      ar,
      cs,
      mode: modeNum,
      objects
    };
  }
  function parseRgb(color) {
    const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return [10, 132, 255];
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  }
  function rgba(color, a) {
    const [r, g, b] = parseRgb(color);
    return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`;
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
    } catch (e) {
      return null;
    }
  }
  function playHitSound(rt, hitSound) {
    if (rt.volume <= 1e-3) return;
    const ctx = ensureAudio(rt);
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = 0.22 * rt.volume;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    let freq = 920;
    if (hitSound & 2) freq = 1200;
    if (hitSound & 8) freq = 700;
    if (hitSound & 4) freq = 420;
    o.frequency.setValueAtTime(freq, now);
    o.frequency.exponentialRampToValueAtTime(freq * 0.45, now + 0.045);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(8e-4, now + 0.07);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.08);
    try {
      const n = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      n.buffer = buf;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.35, now);
      ng.gain.exponentialRampToValueAtTime(8e-4, now + 0.025);
      n.connect(ng);
      ng.connect(ctx.destination);
      n.start(now);
      n.stop(now + 0.03);
    } catch (e) {
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
        }
      } else if (o.kind === "slider") {
        const head = `sh${i}`;
        if (o.t >= from && o.t <= to + 0.5 && !rt.fired.has(head)) {
          rt.fired.add(head);
          playHitSound(rt, o.hitSound);
        }
        const tail = `st${i}`;
        if (o.endTime >= from && o.endTime <= to + 0.5 && !rt.fired.has(tail)) {
          rt.fired.add(tail);
          playHitSound(rt, o.hitSound);
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
      const lead = 450;
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
        let u = (t - a.t) / span;
        const shaped = easeInOutCubic(Math.pow(u, 0.85));
        return lerp(a.p, b.p, shaped);
      }
    }
    return anchors[anchors.length - 1].p;
  }
  function updateCursor(data, t, rt) {
    const target = autoplayTarget(data, t);
    const k = 0.45;
    rt.cursor = {
      x: rt.cursor.x + (target.x - rt.cursor.x) * k,
      y: rt.cursor.y + (target.y - rt.cursor.y) * k
    };
    rt.trail.push({ x: rt.cursor.x, y: rt.cursor.y });
    if (rt.trail.length > 14) rt.trail.shift();
  }
  function drawHitCircle(ctx, cx, cy, r, color, alpha, comboNumber, scaleMul = 1) {
    const rr = r * scaleMul;
    if (rr < 1 || alpha < 0.02) return;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${(0.92 * alpha).toFixed(3)})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 0.9, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(cx - rr * 0.25, cy - rr * 0.25, rr * 0.08, cx, cy, rr * 0.9);
    const [cr, cg, cb] = parseRgb(color);
    grad.addColorStop(
      0,
      `rgba(${Math.min(255, cr + 45)},${Math.min(255, cg + 45)},${Math.min(255, cb + 45)},${alpha})`
    );
    grad.addColorStop(0.55, rgba(color, alpha));
    grad.addColorStop(1, `rgba(${Math.max(0, cr - 55)},${Math.max(0, cg - 55)},${Math.max(0, cb - 55)},${alpha})`);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(28,28,32,${(0.9 * alpha).toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${(0.35 * alpha).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, rr * 0.06);
    ctx.stroke();
    if (comboNumber > 0 && rr > 7) {
      ctx.fillStyle = `rgba(255,255,255,${(0.95 * alpha).toFixed(3)})`;
      ctx.font = `bold ${Math.max(10, Math.round(rr * 0.55))}px system-ui,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(comboNumber), cx, cy + 0.5);
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
  function drawApproach(ctx, cx, cy, r, color, alpha, progress, maxR) {
    const p = clamp(progress, 0, 1);
    const ideal = r * (1 + 2.5 * p);
    const apR = Math.min(ideal, Math.max(r * 1.02, maxR));
    ctx.beginPath();
    ctx.arc(cx, cy, apR, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(color, 0.8 * alpha);
    ctx.lineWidth = Math.max(1.5, r * 0.11);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, apR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${(0.28 * alpha).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, r * 0.045);
    ctx.stroke();
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
    const body = r * 1.72;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokePathMapped(ctx, o.path, layout);
    ctx.strokeStyle = `rgba(255,255,255,${(0.88 * alpha).toFixed(3)})`;
    ctx.lineWidth = border;
    ctx.stroke();
    strokePathMapped(ctx, o.path, layout);
    ctx.strokeStyle = rgba(o.color, 0.82 * alpha);
    ctx.lineWidth = body;
    ctx.stroke();
    strokePathMapped(ctx, o.path, layout);
    ctx.strokeStyle = `rgba(18,18,22,${(0.52 * alpha).toFixed(3)})`;
    ctx.lineWidth = body * 0.52;
    ctx.stroke();
    const end = layout.scr(o.path[o.path.length - 1]);
    const endR = Math.min(r * 0.92, layout.maxRadiusAt(end.x, end.y));
    ctx.beginPath();
    ctx.arc(end.x, end.y, endR, 0, Math.PI * 2);
    ctx.fillStyle = rgba(o.color, 0.72 * alpha);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${(0.65 * alpha).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, r * 0.09);
    ctx.stroke();
  }
  function drawSliderBall(ctx, cx, cy, r, color, alpha) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${(0.95 * alpha).toFixed(3)})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = rgba(color, 0.95 * alpha);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - r * 0.14, cy - r * 0.14, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${(0.5 * alpha).toFixed(3)})`;
    ctx.fill();
  }
  function drawSpinner(ctx, layout, t, o, alpha) {
    const c = layout.scr({ x: PLAY_W / 2, y: PLAY_H / 2 });
    const R = Math.min(layout.pfW, layout.pfH) * 0.28;
    const progress = clamp((t - o.t) / Math.max(1, o.endTime - o.t), 0, 1);
    ctx.beginPath();
    ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${(0.22 * alpha).toFixed(3)})`;
    ctx.lineWidth = 4 * layout.scale;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.x, c.y, R, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.strokeStyle = `rgba(10,132,255,${(0.85 * alpha).toFixed(3)})`;
    ctx.lineWidth = 6 * layout.scale;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  function drawCursor(ctx, layout, rt) {
    const rNote = layout.rPx;
    for (let i = 0; i < rt.trail.length; i++) {
      const p = layout.scr(rt.trail[i]);
      const a = (i + 1) / rt.trail.length * 0.35;
      const rad = rNote * 0.22 * ((i + 1) / rt.trail.length);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fill();
    }
    const c = layout.scr(rt.cursor);
    const cr = Math.min(Math.max(5, rNote * 0.38), layout.maxRadiusAt(c.x, c.y) * 0.9);
    ctx.beginPath();
    ctx.arc(c.x, c.y, cr * 1.25, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = Math.max(1.5, cr * 0.18);
    ctx.stroke();
    const g = ctx.createRadialGradient(c.x - cr * 0.25, c.y - cr * 0.25, 1, c.x, c.y, cr);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.45, "rgba(200,220,255,0.9)");
    g.addColorStop(1, "rgba(90,140,255,0.85)");
    ctx.beginPath();
    ctx.arc(c.x, c.y, cr, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = Math.max(1, cr * 0.12);
    ctx.stroke();
  }
  function circleAnim(t, hitT, preempt) {
    const dt = hitT - t;
    if (dt > preempt) return null;
    if (dt > 0) {
      const lived = preempt - dt;
      const fadeIn = clamp(lived / (preempt * 0.35), 0, 1);
      const alpha2 = fadeIn * fadeIn * (3 - 2 * fadeIn);
      return { alpha: alpha2, scale: 1, approach: dt / preempt, showBody: true, showApproach: true };
    }
    const age = t - hitT;
    const fade = 220;
    if (age > fade) return null;
    const p = age / fade;
    const alpha = (1 - p) * (1 - p);
    const scale = 1 + 0.4 * p;
    return { alpha, scale, approach: 0, showBody: true, showApproach: false };
  }
  function sliderAnim(t, o, preempt) {
    const appear = o.t - preempt;
    const gone = o.endTime + 220;
    if (t < appear || t > gone) return null;
    if (t < o.t) {
      const lived = t - appear;
      const fadeIn = clamp(lived / (preempt * 0.35), 0, 1);
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
    const p = age / 220;
    const alpha = (1 - p) * (1 - p);
    return {
      alpha,
      headScale: 1 + 0.25 * p,
      approach: 0,
      showApproach: false,
      showHead: true,
      showBall: false,
      bodyAlpha: alpha
    };
  }
  function drawPreviewFrame(ctx, data, canvasW, canvasH, t, elapsed, rt) {
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
    ctx.fillStyle = "#0b0b10";
    ctx.fillRect(0, 0, canvasW, canvasH);
    const pfGrad = ctx.createLinearGradient(ox, oy, ox, oy + pfH);
    pfGrad.addColorStop(0, "#16161c");
    pfGrad.addColorStop(1, "#101016");
    ctx.fillStyle = pfGrad;
    ctx.fillRect(ox, oy, pfW, pfH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, pfW, pfH);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.035)";
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
    function phaseOf(o, now) {
      if (o.kind === "circle") {
        if (now >= o.t) return 0;
        return 1;
      }
      if (o.kind === "slider") {
        if (now > o.endTime) return 0;
        if (now >= o.t) return 2;
        return 1;
      }
      if (now > o.endTime) return 0;
      if (now >= o.t) return 2;
      return 1;
    }
    const drawItems = [];
    data.objects.forEach((o, i) => {
      if (o.kind === "circle") {
        const anim = circleAnim(t, o.t, preempt);
        if (!anim) return;
        drawItems.push({ o, i, phase: phaseOf(o, t), anim });
      } else if (o.kind === "slider") {
        const anim = sliderAnim(t, o, preempt);
        if (!anim) return;
        drawItems.push({ o, i, phase: phaseOf(o, t), anim });
      } else if (o.kind === "spinner") {
        if (t < o.t - 100 || t > o.endTime + 100) return;
        const alpha = t < o.t ? clamp(1 - (o.t - t) / 100, 0, 1) : t > o.endTime ? clamp(1 - (t - o.endTime) / 100, 0, 1) : 1;
        drawItems.push({ o, i, phase: phaseOf(o, t), anim: { alpha } });
      }
    });
    drawItems.sort((a, b) => a.phase - b.phase || a.o.t - b.o.t || a.i - b.i);
    for (const item of drawItems) {
      const { o, anim } = item;
      if (o.kind === "slider") {
        const sa = anim;
        drawSliderBody(ctx, o, layout, r, sa.bodyAlpha);
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
      } else if (o.kind === "spinner") {
        drawSpinner(ctx, layout, t, o, anim.alpha);
      }
    }
    for (const item of drawItems) {
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
      }
    }
    if (runtime) {
      drawCursor(ctx, layout, runtime);
    }
    ctx.restore();
    ctx.fillStyle = "#0b0b10";
    if (oy > 0.5) ctx.fillRect(0, 0, canvasW, oy);
    if (oy + pfH < canvasH - 0.5) ctx.fillRect(0, oy + pfH, canvasW, canvasH - oy - pfH);
    if (ox > 0.5) ctx.fillRect(0, oy, ox, pfH);
    if (ox + pfW < canvasW - 0.5) ctx.fillRect(ox + pfW, oy, canvasW - ox - pfW, pfH);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + 0.5, oy + 0.5, pfW - 1, pfH - 1);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "12px system-ui,sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`${(t / 1e3).toFixed(1)}s`, 8, 16);
    return elapsed <= 12e3;
  }
  return __toCommonJS(osu_preview_exports);
})();
