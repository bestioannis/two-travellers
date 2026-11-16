import { VectorTile } from "./vendor/street/vector.js";
import Pbf from "./vendor/street/pbf.js";

// Read the provider's current planet version instead of pinning a dated tile path.
const catalog = "https://tiles.openfreemap.org/planet";
const requestOptions = { credentials: "omit", referrerPolicy: "no-referrer" };
const tiles = new Map(),
  inFlight = new Set(),
  failures = new Map(),
  subscribers = new Set();
let catalogRequest = null,
  template = "",
  maxSourceZoom = 14,
  retryCatalog = 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const tileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const tileY = (lat, z) =>
  ((1 -
    Math.asinh(
      Math.tan((clamp(lat, -85.05112878, 85.05112878) * Math.PI) / 180),
    ) /
      Math.PI) /
    2) *
  2 ** z;
const tileLat = (y, z) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
const extent = 4096;
function notify() {
  for (const callback of subscribers) callback();
}
export function subscribe(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}
function readCatalog() {
  if (catalogRequest || Date.now() < retryCatalog) return;
  catalogRequest = fetch(catalog, requestOptions)
    .then(async (response) => {
      if (!response.ok) throw Error(String(response.status));
      const data = await response.json();
      const url = data.tiles.find(
        (s) =>
          s.startsWith("https://tiles.openfreemap.org/") &&
          s.includes("{z}") &&
          s.includes("{x}") &&
          s.includes("{y}"),
      );
      if (!url) throw Error("Invalid map tile URL");
      template = url;
      maxSourceZoom = clamp(data.maxzoom ?? 14, 0, 16);
      retryCatalog = 0;
    })
    .catch(() => {
      retryCatalog = Date.now() + 30000;
    })
    .finally(() => {
      catalogRequest = null;
      notify();
    });
}

const groups = {
  neighborhood: { fill: "#edeae1" },
  industrial: { fill: "#e8e4df" },
  campus: { fill: "#ece3d5" },
  green: { fill: "#dce6d0" },
  forest: { fill: "#c9dcc3" },
  sand: { fill: "#e9debd" },
  water: { fill: "#b2d3db" },
  stream: { line: "#96bfcb", w: 1.3 },
  buildings: { fill: "#ddd3c7", line: "#cbbfb1", w: 0.55, min: 14 },
  pedestrian: { fill: "#ece6dc", min: 12 },
  path: { line: "#c4ad95", w: 1.2, min: 13, dash: true },
  service: { edge: "#dfd8cc", line: "#fcfaf3", w: 2, min: 11 },
  street: { edge: "#cfc8bb", line: "#fffdf6", w: 3.4, min: 9 },
  arterial: { edge: "#d1b99a", line: "#f8e4b8", w: 4.5 },
  highway: { edge: "#c8a182", line: "#ecc99d", w: 5.5 },
  rail: { line: "#9a9e9a", w: 1.3, dash: true, min: 8 },
};
const transitStyles = {
  subway: { line: "#8950aa", w: 4 },
  lightRail: { line: "#198274", w: 3.5 },
  rail: { line: "#4476b3", w: 3 },
};
const fade = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const greens = new Set([
  "park",
  "grass",
  "grassland",
  "meadow",
  "recreation_ground",
  "village_green",
  "pitch",
  "golf_course",
  "cemetery",
  "garden",
  "farmland",
  "orchard",
  "scrub",
]);
function paintGroup(layer, props, type) {
  const cls = props.class;
  switch (layer) {
    case "landcover":
    case "landuse":
    case "park":
      if (type !== 3) return;
      if (layer === "park" || greens.has(cls)) return "green";
      if (cls === "wood" || cls === "forest") return "forest";
      if (cls === "sand" || cls === "beach") return "sand";
      if (["hospital", "school", "university", "college"].includes(cls))
        return "campus";
      if (["industrial", "commercial", "retail", "railway"].includes(cls))
        return "industrial";
      if (cls === "residential") return "neighborhood";
      return;
    case "water":
      return type === 3 ? "water" : null;
    case "waterway":
      return type === 2 ? "stream" : null;
    case "building":
      return type === 3 ? "buildings" : null;
    case "transportation":
      if (type === 3) return "pedestrian";
      if (type !== 2) return;
      if (cls === "motorway" || cls === "trunk") return "highway";
      if (["primary", "secondary", "tertiary"].includes(cls)) return "arterial";
      if (["rail", "transit"].includes(cls)) {
        if (props.subclass === "subway") return "subway";
        if (["light_rail", "tram"].includes(props.subclass)) return "lightRail";
        return "rail";
      }
      if (["path", "track"].includes(cls)) return "path";
      if (cls === "service") return "service";
      return "street";
  }
}
const labelLayers = [
  "place",
  "mountain_peak",
  "water_name",
  "transportation_name",
  "poi",
  "housenumber",
];
function labelRule(layer, props) {
  if (layer === "housenumber") return [18.5, 6];
  if (layer === "place") {
    if (["continent", "country", "state"].includes(props.class)) return;
    return [props.class === "city" ? 6 : props.class === "town" ? 9 : 12, 0];
  }
  if (layer === "transportation_name")
    return [
      props.class === "motorway" || props.class === "trunk"
        ? 10
        : props.class === "primary"
          ? 12
          : 14,
      1,
    ];
  if (layer === "poi" && props.class === "railway") return [11, -1];
  if (layer === "poi") return [(props.rank ?? 4) < 4 ? 14.5 : 16, 3];
  return [12, 2];
}
export function decodeTile(buffer, z, x, y) {
  const vector = new VectorTile(new Pbf(new Uint8Array(buffer)));
  const width = 360 / 2 ** z,
    north = tileLat(y, z),
    south = tileLat(y + 1, z);
  const mappedY = new Map(),
    paths = new Map(),
    labels = [];
  function local(x, y, units) {
    const xx = (x * extent) / units,
      yy = (y * extent) / units;
    let projected = mappedY.get(yy);
    if (projected === undefined) {
      projected = ((north - tileLat(tile.y + yy / extent, z)) * extent) / width;
      mappedY.set(yy, projected);
    }
    return { x: xx, y: projected };
  }
  const tile = { x, y, z, width, north, height: north - south, paths, labels };
  for (const name of [
    "landuse",
    "landcover",
    "park",
    "water",
    "waterway",
    "building",
    "transportation",
    ...labelLayers,
  ]) {
    const layer = vector.layers[name];
    if (!layer) continue;
    const textLayer = labelLayers.includes(name);
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i),
        props = feature.properties;
      if (textLayer) {
        const rule = labelRule(name, props);
        if (!rule) continue;
        const text = String(
          props["name:zh-Hans"] ||
            props["name:zh"] ||
            props.name ||
            props.housenumber ||
            "",
        ).trim();
        if (!text || text.length > 64) continue;
        const part = feature
          .loadGeometry()
          .reduce((a, b) => (a.length > b.length ? a : b), []);
        if (!part.length) continue;
        const p = part[Math.floor(part.length / 2)];
        // Only the tile containing an anchor labels it, even when adjacent tiles contain buffered copies.
        if (p.x < 0 || p.x >= layer.extent || p.y < 0 || p.y >= layer.extent)
          continue;
        const pt = local(p.x, p.y, layer.extent);
        labels.push({
          ...pt,
          text,
          min: rule[0],
          order: rule[1],
          rank: props.rank ?? 10,
        });
      } else {
        const group = paintGroup(name, props, feature.type);
        if (!group) continue;
        let path = paths.get(group);
        if (!path) paths.set(group, (path = new Path2D()));
        for (const line of feature.loadGeometry()) {
          for (let n = 0; n < line.length; n++) {
            const p = local(line[n].x, line[n].y, layer.extent);
            if (n === 0) path.moveTo(p.x, p.y);
            else path.lineTo(p.x, p.y);
          }
          if (feature.type === 3) path.closePath();
        }
      }
    }
  }
  return tile;
}
async function load(key, z, x, y) {
  if (
    tiles.has(key) ||
    inFlight.has(key) ||
    Date.now() < (failures.get(key) || 0)
  )
    return;
  inFlight.add(key);
  try {
    const url = template.replace("{z}", z).replace("{x}", x).replace("{y}", y);
    const response = await fetch(url, requestOptions);
    if (response.status === 404 || response.status === 410) {
      template = "";
      throw Error("Expired source");
    }
    if (!response.ok) throw Error(String(response.status));
    const data = await response.arrayBuffer();
    const decoded = decodeTile(data, z, x, y);
    decoded.arrived = performance.now();
    decoded.bytes = data.byteLength;
    tiles.set(key, decoded);
    // Prefer the active neighborhood and bound memory even in dense city centers.
    let size = 0;
    for (const t of tiles.values()) size += t.bytes;
    while (tiles.size > 48 || (size > 12 * 1024 * 1024 && tiles.size > 6)) {
      const oldest = tiles.keys().next().value;
      size -= tiles.get(oldest).bytes;
      tiles.delete(oldest);
    }
    failures.delete(key);
  } catch {
    failures.set(key, Date.now() + 30000);
  } finally {
    inFlight.delete(key);
    notify();
  }
}
function paintTile(ctx, tile, atX, atY, scale, zoom, box, candidates, transit) {
  const k = (tile.width * scale) / extent,
    height = tile.height * scale;
  ctx.save();
  ctx.translate(atX, atY);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.rect(0, 0, extent, height / k);
  ctx.clip();
  ctx.fillStyle = "#f3f0e7";
  ctx.fillRect(0, 0, extent, height / k);
  const growth = 2 ** clamp((zoom - 13) * 0.27, -1.3, 2.2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const baseAlpha = ctx.globalAlpha;
  for (const name of [...Object.keys(groups), "lightRail", "subway"]) {
    const transport = transitStyles[name];
    const style = transport
      ? transit
        ? transport
        : groups.rail
      : groups[name];
    const p = tile.paths.get(name);
    if (!p || zoom < (style.min || 0)) continue;
    ctx.globalAlpha =
      baseAlpha *
      fade((zoom - (style.min || 0)) * 2) *
      (transit && style.edge ? 0.5 : 1);
    if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fill(p, "evenodd");
    }
    if (style.line) {
      const width = style.w * (style.fill ? 1 : growth);
      if (style.edge) {
        ctx.lineWidth = (width + 1.15) / k;
        ctx.strokeStyle = style.edge;
        ctx.stroke(p);
      }
      if (style.dash) ctx.setLineDash([3.2 / k, 2.4 / k]);
      ctx.lineWidth = width / k;
      ctx.strokeStyle = style.line;
      ctx.stroke(p);
      if (style.dash) ctx.setLineDash([]);
    }
  }
  ctx.restore();
  for (const label of tile.labels) {
    const station = label.order === -1;
    const min = station && !transit ? 15 : label.min;
    if (zoom < min || (transit && label.order === 3)) continue;
    const x = atX + label.x * k,
      y = atY + label.y * k;
    if (x < -30 || x > box.w + 30 || y < 0 || y > box.h) continue;
    if (x >= box.left && x < box.right && y >= box.top && y < box.bottom)
      candidates.push({
        l: label,
        x,
        y,
        alpha: baseAlpha * fade((zoom - min) * 2),
      });
  }
}
function paintLabels(ctx, candidates) {
  candidates.sort(
    (a, b) =>
      a.l.order - b.l.order ||
      a.l.rank - b.l.rank ||
      b.alpha - a.alpha ||
      a.l.text.localeCompare(b.l.text),
  );
  const occupied = [],
    repeated = new Map();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  for (const { l, x, y, alpha } of candidates) {
    const near = repeated.get(l.text);
    if (near?.some((q) => Math.abs(x - q.x) < 140 && Math.abs(y - q.y) < 95))
      continue;
    const size = l.order === 0 ? 13 : l.order === 6 ? 9 : 11;
    ctx.font =
      (l.order === 0 ? "600 " : "500 ") +
      size +
      'px -apple-system, "PingFang SC", sans-serif';
    const rx = ctx.measureText(l.text).width / 2 + 4,
      ry = size * 0.66;
    if (
      occupied.some(
        (b) => Math.abs(b.x - x) < b.rx + rx && Math.abs(b.y - y) < b.ry + ry,
      )
    )
      continue;
    occupied.push({ x, y, rx, ry });
    if (near) near.push({ x, y });
    else repeated.set(l.text, [{ x, y }]);
    ctx.globalAlpha = alpha;
    if (l.order === -1) {
      ctx.beginPath();
      ctx.arc(x, y - 10, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#604784";
      ctx.stroke();
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#fffcf4";
    ctx.strokeText(l.text, x, y);
    ctx.fillStyle =
      l.order === 3 ? "#62796c" : l.order === 6 ? "#887d71" : "#53625e";
    ctx.fillText(l.text, x, y);
  }
}
let fadeFrame = 0;
export const streetThreshold = 5;
// The atlas provides an existing land silhouette for China/Taiwan. source-atop also
// clips street names and buildings, including cross-border features inside an MVT buffer.
export function paintStreets(ctx, { clip, scale, px, w, h, scope, transit }) {
  const zoom = Math.log2((scale * 360) / 512);
  if (zoom < streetThreshold) return "hidden";
  if (!template) {
    readCatalog();
    return Date.now() < retryCatalog ? "offline" : "loading";
  }
  const z = clamp(Math.ceil(zoom), 0, maxSourceZoom),
    n = 2 ** z;
  const xmin = clamp(Math.floor(tileX(clip[0] - 180, z)), 0, n - 1),
    xmax = clamp(Math.floor(tileX(clip[2] - 180, z)), 0, n - 1);
  const ymin = clamp(Math.floor(tileY(90 - clip[1], z)), 0, n - 1),
    ymax = clamp(Math.floor(tileY(90 - clip[3], z)), 0, n - 1);
  if (90 - clip[3] > 85.0511 || 90 - clip[1] < -85.0511) return "offline";
  const wanted = [],
    candidates = [];
  for (let y = ymin; y <= ymax; y++)
    for (let x = xmin; x <= xmax; x++)
      wanted.push({ x, y, key: z + "/" + x + "/" + y });
  const midX = (xmin + xmax) / 2,
    midY = (ymin + ymax) / 2;
  wanted.sort(
    (a, b) =>
      Math.hypot(a.x - midX, a.y - midY) - Math.hypot(b.x - midX, b.y - midY),
  );
  let loaded = 0,
    failed = false;
  ctx.save();
  ctx.setTransform(px, 0, 0, px, 0, 0);
  if (scope !== "world") ctx.globalCompositeOperation = "source-atop";
  const now = performance.now();
  let animating = false;
  for (const { x, y, key } of wanted) {
    const tile = tiles.get(key);
    if (!tile) {
      failed ||= Date.now() < (failures.get(key) || 0);
      if (inFlight.size < 5) load(key, z, x, y);
    }
    const width = 360 / n;
    const left = (x * width - clip[0]) * scale;
    const top = (90 - tileLat(y, z) - clip[1]) * scale;
    const right = left + width * scale;
    const bottom = (90 - tileLat(y + 1, z) - clip[1]) * scale;
    const box = { w, h, left, top, right, bottom };
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    const opacity = fade(zoom - streetThreshold);
    function draw(t, alpha) {
      ctx.globalAlpha = opacity * alpha;
      if (ctx.globalAlpha <= 0) return;
      const atX = (t.x * t.width - clip[0]) * scale;
      const atY = (90 - t.north - clip[1]) * scale;
      paintTile(ctx, t, atX, atY, scale, zoom, box, candidates, transit);
      loaded++;
    }
    let parent;
    for (let d = 1; d <= z && !parent; d++) {
      parent = tiles.get([z - d, x >> d, y >> d].join("/"));
    }
    const childAlpha = tile ? fade((now - tile.arrived) / 220) : 0;
    const blend =
      childAlpha *
      (parent && z === Math.ceil(zoom) ? fade((zoom - z + 1) * 2) : 1);
    if (blend < 1) {
      if (parent) draw(parent, 1);
      else
        for (let dx = 0; dx < 2; dx++)
          for (let dy = 0; dy < 2; dy++) {
            const child = tiles.get([z + 1, x * 2 + dx, y * 2 + dy].join("/"));
            if (child) draw(child, 1);
          }
    }
    if (tile) {
      tiles.delete(key);
      tiles.set(key, tile);
      draw(tile, blend);
      animating ||= childAlpha < 1;
    }
    ctx.restore();
  }
  if (animating && !fadeFrame)
    fadeFrame = requestAnimationFrame(() => {
      fadeFrame = 0;
      notify();
    });
  paintLabels(ctx, candidates);
  ctx.restore();
  return loaded ? "ready" : failed ? "offline" : "loading";
}
