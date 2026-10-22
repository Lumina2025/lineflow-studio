/**
 * Lineflow's dependency-free Canvas renderer.
 * All coordinates are logical scene pixels. The caller owns canvas sizing,
 * device-pixel-ratio and scale transforms. phase is normalized to a single loop.
 * editing=true adds visible path guides, selected control points and draft points.
 */
const sampleCache = new Map();
const CACHE_LIMIT = 160;
const TAU = Math.PI * 2;
const FONT = '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif';
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;

function pathKey(path) {
  return `${path.smooth ? 1 : 0}|${(path.points || []).map(p => `${finite(p.x)},${finite(p.y)}`).join(';')}`;
}

/** Samples contain accumulated distance d; their first and final positions are exact. */
export function getPathSamples(path) {
  if (!path) return [];
  const key = pathKey(path);
  if (sampleCache.has(key)) return sampleCache.get(key);
  const points = (path.points || []).filter(p => Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
    .map(p => ({ x: Number(p.x), y: Number(p.y) }))
    .filter((p, i, array) => !i || Math.hypot(p.x - array[i - 1].x, p.y - array[i - 1].y) > .001);
  const sampled = [];
  const push = (x, y) => {
    const last = sampled[sampled.length - 1];
    sampled.push({ x, y, d: last ? last.d + Math.hypot(x - last.x, y - last.y) : 0 });
  };
  if (points.length) push(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)], b = points[i];
    const c = points[i + 1], d = points[Math.min(points.length - 1, i + 2)];
    if (!path.smooth) { push(c.x, c.y); continue; }
    const subdivisions = clamp(Math.ceil((Math.hypot(c.x - b.x, c.y - b.y) + Math.hypot(b.x - a.x, b.y - a.y) * .15) / 4), 12, 180);
    for (let j = 1; j <= subdivisions; j++) {
      const t = j / subdivisions, t2 = t * t, t3 = t2 * t;
      const cubic = (p0, p1, p2, p3) => .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      push(cubic(a.x, b.x, c.x, d.x), cubic(a.y, b.y, c.y, d.y));
    }
  }
  if (sampleCache.size >= CACHE_LIMIT) sampleCache.delete(sampleCache.keys().next().value);
  sampleCache.set(key, sampled);
  return sampled;
}

export function pathLength(path) {
  const samples = getPathSamples(path);
  return samples.length ? samples[samples.length - 1].d : 0;
}

function positionAt(samples, distance) {
  if (!samples.length) return { x: 0, y: 0, angle: 0 };
  if (samples.length === 1) return { ...samples[0], angle: 0 };
  const total = samples[samples.length - 1].d;
  const target = clamp(distance, 0, total);
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) {
    const middle = (lo + hi) >> 1;
    if (samples[middle].d < target) lo = middle; else hi = middle;
  }
  const a = samples[lo], b = samples[hi];
  const fraction = (target - a.d) / (b.d - a.d || 1);
  return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

function trace(ctx, samples) {
  if (!samples.length) return;
  ctx.beginPath();
  ctx.moveTo(samples[0].x, samples[0].y);
  for (let i = 1; i < samples.length; i++) ctx.lineTo(samples[i].x, samples[i].y);
}

function roundedRect(ctx, x, y, width, height, radius = 12) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function label(ctx, value, x, y, size, color, weight = 400, align = 'left') {
  ctx.fillStyle = color; ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(value, x, y);
}

function circle(ctx, x, y, r, color) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = color; ctx.fill();
}

function icon(ctx, type, x, y, color) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (type === 'user') {
    ctx.arc(0, -5, 4, 0, TAU); ctx.stroke(); ctx.beginPath();
    ctx.arc(0, 9, 8, Math.PI, 0); ctx.stroke();
  } else if (type === 'knowledge') {
    ctx.moveTo(-10, -8); ctx.lineTo(-3, -8); ctx.quadraticCurveTo(0, -8, 0, -5);
    ctx.quadraticCurveTo(0, -8, 3, -8); ctx.lineTo(10, -8); ctx.lineTo(10, 7); ctx.lineTo(3, 7);
    ctx.quadraticCurveTo(0, 7, 0, 10); ctx.quadraticCurveTo(0, 7, -3, 7); ctx.lineTo(-10, 7); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 10); ctx.stroke();
  } else if (type === 'reasoning') {
    ctx.moveTo(0, -11); ctx.lineTo(2.8, -3); ctx.lineTo(11, 0); ctx.lineTo(2.8, 3);
    ctx.lineTo(0, 11); ctx.lineTo(-2.8, 3); ctx.lineTo(-11, 0); ctx.lineTo(-2.8, -3); ctx.closePath(); ctx.stroke();
  } else if (type === 'tools') {
    ctx.moveTo(-9, -7); ctx.lineTo(-3, -1); ctx.moveTo(9, -7); ctx.lineTo(3, -1);
    ctx.moveTo(-9, 8); ctx.lineTo(-3, 2); ctx.moveTo(9, 8); ctx.lineTo(3, 2); ctx.stroke();
    circle(ctx, 0, 0, 3.5, color); circle(ctx, -10, -8, 2, color); circle(ctx, 10, -8, 2, color); circle(ctx, -10, 9, 2, color); circle(ctx, 10, 9, 2, color);
  } else if (type === 'apps') {
    for (const xx of [-10, 2]) for (const yy of [-10, 2]) { roundedRect(ctx, xx, yy, 8, 8, 2); ctx.stroke(); }
  } else if (type === 'memory') {
    ctx.ellipse(0, -7, 10, 4, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(-10, 7); ctx.ellipse(0, 7, 10, 4, 0, Math.PI, 0, true); ctx.lineTo(10, -7); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI); ctx.stroke();
  }
  ctx.restore();
}

function demoBackground(ctx, width, height) {
  ctx.save(); ctx.scale(width / 1200, height / 800);
  for (let y = 112; y < 730; y += 24) for (let x = 40; x < 1180; x += 24) circle(ctx, x, y, .65, '#e2e2dd');
  circle(ctx, 45, 37, 4, '#ec995b');
  label(ctx, 'AGENT WORKFLOW', 58, 42, 12, '#6c726d', 650);
  label(ctx, 'Ideas become actions.', 40, 80, 27, '#233635', 650);
  label(ctx, '07 NODES  /  07 CONNECTIONS', 1158, 42, 11, '#878d86', 500, 'right');
  ctx.beginPath(); ctx.moveTo(40, 745); ctx.lineTo(1160, 745); ctx.strokeStyle = '#e4e6df'; ctx.lineWidth = 1; ctx.stroke();
  label(ctx, 'Animated connection paths', 40, 775, 12, '#7b827b', 500);
  label(ctx, '让每一条连接，流动起来', 212, 775, 12, '#9a9e96', 400);
  label(ctx, 'LINEFLOW  /  01', 1160, 775, 11, '#848b82', 550, 'right');
  ctx.restore();
}

function demoNode(ctx, { x, y, width = 230, height = 120, title, subtitle, type, accent = '#ad8543', tag }) {
  ctx.save();
  ctx.shadowColor = 'rgba(31,52,43,.055)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 7;
  roundedRect(ctx, x, y, width, height, 17); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#e5e7df'; ctx.lineWidth = 1; ctx.stroke();
  roundedRect(ctx, x + 18, y + 18, 36, 36, 10); ctx.fillStyle = '#f7f5ed'; ctx.fill();
  icon(ctx, type, x + 36, y + 36, accent);
  label(ctx, title, x + 66, y + 33, 16, '#2e413b', 650);
  label(ctx, subtitle, x + 66, y + 53, 12, '#8a9288', 400);
  ctx.beginPath(); ctx.moveTo(x + 18, y + 73); ctx.lineTo(x + width - 18, y + 73); ctx.strokeStyle = '#f0f1eb'; ctx.stroke();
  circle(ctx, x + 22, y + 96, 3, accent);
  label(ctx, tag, x + 33, y + 100, 11, '#858e82', 500);
  ctx.restore();
}

function demoForeground(ctx, width, height) {
  ctx.save(); ctx.scale(width / 1200, height / 800);
  demoNode(ctx, { x: 100, y: 130, title: 'Knowledge', subtitle: '检索知识', type: 'knowledge', tag: 'Documents · Vector search', accent: '#b49a4b' });
  demoNode(ctx, { x: 80, y: 350, title: 'User request', subtitle: '用户输入', type: 'user', tag: 'A question. A new possibility.', accent: '#b3855f' });
  demoNode(ctx, { x: 485, y: 80, title: 'Reason & plan', subtitle: '推理与规划', type: 'reasoning', tag: 'Think · Break down · Decide', accent: '#b99946' });
  demoNode(ctx, { x: 870, y: 130, title: 'Tools', subtitle: '工具调用', type: 'tools', tag: 'Search · Code · APIs', accent: '#bf8157' });
  demoNode(ctx, { x: 870, y: 540, title: 'Applications', subtitle: '执行与交付', type: 'apps', tag: 'The right action, delivered.', accent: '#5f977c' });
  demoNode(ctx, { x: 485, y: 580, title: 'Memory', subtitle: '上下文记忆', type: 'memory', tag: 'Remember · Retrieve · Improve', accent: '#729278' });

  ctx.shadowColor = 'rgba(22,49,47,.18)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 10;
  roundedRect(ctx, 482, 310, 236, 160, 22); ctx.fillStyle = '#203c3b'; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#365452'; ctx.lineWidth = 1; ctx.stroke();
  circle(ctx, 600, 347, 20, '#304f49');
  icon(ctx, 'reasoning', 600, 347, '#edc878');
  label(ctx, 'AI Agent', 600, 400, 27, '#ffffff', 650, 'center');
  label(ctx, '感知  ·  思考  ·  行动', 600, 426, 12, '#adc5b9', 400, 'center');
  circle(ctx, 574, 449, 2.7, '#d8bf76');
  label(ctx, 'IN MOTION', 584, 453, 9, '#d8cfb2', 550);
  ctx.restore();
}

function drawSegment(ctx, samples, from, to) {
  const a = positionAt(samples, from);
  ctx.beginPath(); ctx.moveTo(a.x, a.y);
  for (const p of samples) if (p.d > from && p.d < to) ctx.lineTo(p.x, p.y);
  const b = positionAt(samples, to); ctx.lineTo(b.x, b.y); ctx.stroke();
}

function renderPath(ctx, path, settings, phase) {
  const samples = getPathSamples(path);
  if (samples.length < 2) return;
  const length = samples[samples.length - 1].d;
  if (length <= .001) return;
  const width = clamp(finite(path.width, 3), .5, 32);
  const color = path.color || '#c6974e';
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.fillStyle = color;
  if (settings.showBase !== false) {
    ctx.globalAlpha = .23; ctx.lineWidth = Math.max(1, width * .65);
    trace(ctx, samples); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const requestedSpacing = clamp(finite(settings.spacing, 80), 14, 500);
  const count = clamp(Math.round(length / requestedSpacing), 1, 600);
  const spacing = length / count;
  const cycles = Math.max(1, Math.round(finite(settings.speed, 3)));
  const direction = path.direction === -1 ? -1 : 1;
  // An integer count of complete particle spacings makes every exported loop seamless.
  const offset = phase * cycles * spacing * direction;
  if (settings.glow) { ctx.shadowColor = color; ctx.shadowBlur = 11 + width; }
  ctx.lineWidth = width;
  for (let i = 0; i < count; i++) {
    const distance = ((i * spacing + offset) % length + length) % length;
    const p = positionAt(samples, distance);
    if (path.effect === 'dots') {
      circle(ctx, p.x, p.y, Math.max(2.3, width * 1.15), color);
    } else if (path.effect === 'dashes') {
      const dashLength = Math.min(spacing * .38, Math.max(14, width * 6));
      const start = distance - dashLength / 2, end = distance + dashLength / 2;
      if (start < 0) { drawSegment(ctx, samples, 0, end); drawSegment(ctx, samples, length + start, length); }
      else if (end > length) { drawSegment(ctx, samples, start, length); drawSegment(ctx, samples, 0, end - length); }
      else drawSegment(ctx, samples, start, end);
    } else {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle + (direction === -1 ? Math.PI : 0));
      const size = Math.max(7, width * 2.7);
      ctx.beginPath(); ctx.moveTo(-size * .76, -size * .54); ctx.lineTo(size * .25, 0); ctx.lineTo(-size * .76, size * .54);
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.6, width * .85); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawEditing(ctx, state, selectedId, draft) {
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const selected = (state.paths || []).find(path => path.id === selectedId);
  if (selected) {
    const samples = getPathSamples(selected);
    ctx.setLineDash([6, 6]); ctx.lineWidth = 1.2; ctx.strokeStyle = '#557d6e'; ctx.globalAlpha = .65;
    trace(ctx, samples); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    for (let i = 0; i < (selected.points || []).length; i++) {
      const p = selected.points[i];
      ctx.shadowColor = 'rgba(25,47,41,.18)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1;
      circle(ctx, p.x, p.y, i === 0 || i === selected.points.length - 1 ? 6 : 5, '#ffffff');
      ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#366550'; ctx.lineWidth = 1.8; ctx.stroke();
      circle(ctx, p.x, p.y, 1.5, '#366550');
    }
  }
  const draftPoints = Array.isArray(draft) ? draft : draft?.points;
  if (draftPoints?.length) {
    const preview = draft?.preview || draft?.cursor;
    const points = preview ? [...draftPoints, preview] : draftPoints;
    const draftPath = { points, smooth: draft?.smooth !== false };
    ctx.strokeStyle = draft?.color || '#4c8265'; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
    trace(ctx, getPathSamples(draftPath)); ctx.stroke(); ctx.setLineDash([]);
    draftPoints.forEach((p, i) => { circle(ctx, p.x, p.y, i === 0 ? 6 : 4.5, '#ffffff'); ctx.stroke(); circle(ctx, p.x, p.y, 1.5, '#4c8265'); });
    if (preview) { circle(ctx, preview.x, preview.y, 4, '#4c8265'); }
  }
  ctx.restore();
}

/**
 * Paints a whole scene. Handles both number phases and values outside [0, 1].
 * draft may be an array of points or {points, preview|cursor, smooth, color}.
 * Hide editing for export; selectedId alone never changes the final render.
 */
export function renderScene(ctx, state, phase = 0, { backgroundImage = null, editing = false, selectedId = null, draft = null } = {}) {
  const width = Math.max(1, finite(state.width, 1200));
  const height = Math.max(1, finite(state.height, 800));
  const normalizedPhase = ((finite(phase) % 1) + 1) % 1;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = state.backgroundColor || '#f7f8fa'; ctx.fillRect(0, 0, width, height);
  if (backgroundImage) ctx.drawImage(backgroundImage, 0, 0, width, height);
  else if (state.demo) demoBackground(ctx, width, height);
  for (const path of state.paths || []) if (path.visible !== false) renderPath(ctx, path, state.settings || {}, normalizedPhase);
  if (state.demo && !backgroundImage) demoForeground(ctx, width, height);
  if (editing) drawEditing(ctx, state, selectedId, draft);
  ctx.restore();
}

export function makeDemoState() {
  const path = (id, name, points, color, effect = 'arrows') => ({ id, name, points: points.map(([x, y]) => ({ x, y })), smooth: true, color, width: 3, effect, direction: 1, visible: true });
  return {
    version: 1, width: 1200, height: 800, name: 'Agent 工作流', demo: true, backgroundColor: '#f8f9f3', backgroundData: null,
    paths: [
      path('request', '用户输入 → Agent', [[310, 410], [390, 410], [410, 390], [482, 390]], '#bd9568'),
      path('knowledge', '知识检索 → Agent', [[330, 190], [385, 190], [385, 310], [420, 340], [482, 340]], '#c2a55c'),
      path('reason', 'Agent → 推理规划', [[600, 310], [600, 200]], '#bca052'),
      path('tools', 'Agent → 工具调用', [[718, 350], [765, 350], [790, 310], [790, 210], [825, 190], [870, 190]], '#ca9264'),
      path('tool-result', '工具 → 应用', [[985, 250], [985, 540]], '#c1976f', 'dashes'),
      path('delivery', 'Agent → 执行交付', [[718, 430], [765, 430], [790, 470], [790, 565], [825, 600], [870, 600]], '#719e83'),
      path('memory', 'Agent → 记忆', [[600, 470], [600, 580]], '#8ba079', 'dots')
    ],
    settings: { speed: 3, spacing: 80, glow: false, showBase: true, loopSeconds: 3 },
    export: { width: 960, fps: 20, duration: 3 }
  };
}
