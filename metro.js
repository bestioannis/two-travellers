// Coordinates in the source are delta encoded at 1e-5 degrees.
const chunks = new Map();
const requests = new Set();
const retryAt = new Map();
let index;
function load(file, receive, redraw) {
  if (requests.has(file) || Date.now() < (retryAt.get(file) || 0)) return;
  requests.add(file);
  fetch("./" + file, { credentials: "omit", referrerPolicy: "no-referrer" })
    .then((response) => {
      if (!response.ok) throw Error(String(response.status));
      return response.json();
    })
    .then(receive)
    .catch(() => retryAt.set(file, Date.now() + 15000))
    .finally(() => {
      requests.delete(file);
      redraw();
    });
}
function decode(encoded) {
  const path = new Path2D();
  let anchor,
    i = 0,
    x = 0,
    y = 0;
  function delta() {
    let n = 0,
      bits = 0,
      value;
    do {
      value = encoded.charCodeAt(i++) - 63;
      n |= (value & 31) << bits;
      bits += 5;
    } while (value >= 32);
    return n & 1 ? ~(n >> 1) : n >> 1;
  }
  while (i < encoded.length) {
    const start = i === 0;
    x += delta();
    y += delta();
    const lon = 180 + x / 100000,
      lat = 90 - y / 100000;
    if (!anchor && i >= encoded.length / 2) anchor = [lon, lat];
    if (start) path.moveTo(lon, lat);
    else path.lineTo(lon, lat);
  }
  return { path, anchor };
}
export function paintMetro(ctx, { clip, scale, px, scope }, redraw) {
  const zoom = Math.log2((scale * 360) / 512);
  if (zoom < 5) return;
  if (!index) {
    load("metro-index.json", (value) => (index = value), redraw);
    return;
  }
  function visible([west, south, east, north]) {
    return (
      east + 180 >= clip[0] &&
      west + 180 <= clip[2] &&
      90 - north <= clip[3] &&
      90 - south >= clip[1]
    );
  }
  const width = Math.min(4, Math.max(1, (zoom - 3) * 0.4));
  const stops = [],
    badges = new Map();
  ctx.save();
  if (scope === "china") ctx.globalCompositeOperation = "source-atop";
  ctx.lineWidth = width / scale;
  ctx.lineJoin = ctx.lineCap = "round";
  for (const [file, boxes] of index) {
    if (!boxes.some(visible)) continue;
    const cities = chunks.get(file);
    if (!cities) {
      load(
        file,
        (value) => {
          chunks.set(file, value);
          if (chunks.size > 8) chunks.delete(chunks.keys().next().value);
        },
        redraw,
      );
      continue;
    }
    chunks.delete(file);
    chunks.set(file, cities);
    for (const [, box, lines, stations] of cities) {
      if (!visible(box)) continue;
      for (const route of lines) {
        const [bounds, color] = route;
        if (!visible(bounds)) continue;
        if (typeof route[3] === "string") route[3] = decode(route[3]);
        ctx.strokeStyle = color || "#808684";
        ctx.stroke(route[3].path);
        const ref = route[2],
          anchor = route[3].anchor;
        if (
          zoom >= 8 &&
          zoom < 11 &&
          ref &&
          anchor &&
          !badges.has(ref) &&
          anchor[0] > clip[0] &&
          anchor[0] < clip[2] &&
          anchor[1] > clip[1] &&
          anchor[1] < clip[3]
        ) {
          badges.set(ref, {
            x: (anchor[0] - clip[0]) * scale,
            y: (anchor[1] - clip[1]) * scale,
            color: ctx.strokeStyle,
          });
        }
      }
      if (zoom >= 9) {
        for (const [lon, lat, name] of stations) {
          const x = (180 + lon - clip[0]) * scale,
            y = (90 - lat - clip[1]) * scale;
          if (
            x >= 0 &&
            y >= 0 &&
            x <= (clip[2] - clip[0]) * scale &&
            y <= (clip[3] - clip[1]) * scale
          )
            stops.push({ x, y, name });
        }
      }
    }
  }
  ctx.setTransform(px, 0, 0, px, 0, 0);
  ctx.fillStyle = "#fffdf7";
  ctx.strokeStyle = "#535b59";
  ctx.lineWidth = 1;
  for (const { x, y } of stops) {
    ctx.beginPath();
    ctx.arc(x, y, Math.min(4, (zoom - 8) * 0.8), 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
  const occupied = [];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 10px system-ui";
  for (const [ref, { x, y, color }] of badges) {
    const half = ctx.measureText(ref).width / 2 + 4;
    if (
      occupied.some(
        (b) =>
          Math.abs(y - b.y) < 16 &&
          x - half < b.right + 4 &&
          x + half > b.left - 4,
      )
    )
      continue;
    occupied.push({ left: x - half, right: x + half, y });
    ctx.fillStyle = "#fffdf7";
    ctx.fillRect(x - half, y - 6, half * 2, 12);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.strokeRect(x - half, y - 6, half * 2, 12);
    ctx.fillStyle = "#25332d";
    ctx.fillText(ref, x, y);
  }
  if (zoom >= 10) {
    ctx.font = '600 11px -apple-system, "PingFang SC", sans-serif';
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const { x, y, name } of stops) {
      const left = x + 6,
        right = left + ctx.measureText(name).width;
      if (
        occupied.some(
          (b) =>
            Math.abs(y - b.y) < 14 && left < b.right + 4 && right > b.left - 4,
        )
      )
        continue;
      occupied.push({ left, right, y });
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#fffdf7";
      ctx.strokeText(name, left, y);
      ctx.fillStyle = "#374842";
      ctx.fillText(name, left, y);
    }
  }
  ctx.restore();
}
