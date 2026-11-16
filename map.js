(() => {
  "use strict";
  const palette = {
    sea: "#c6e1df",
    grid: "rgba(95,148,148,.27)",
    land: "#f3e8cb",
    border: "#c0b69a",
    coast: "#aab6a0",
    ink: "#324f47",
    waterInk: "#5e9394",
    visited: "#357f72",
    wish: "#cb6849",
  };
  const statusOf = (records, id) =>
    (records instanceof Map ? records.get(id) : records?.[id])?.status;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const asPath = (d) => (typeof d === "string" && d ? new Path2D(d) : null);
  function bounds(d) {
    if (!d || /[^MLZz\d\s.,+\-]/.test(d)) return null;
    const coords = d.match(/-?(?:\d*\.)?\d+/g);
    if (!coords || coords.length < 4 || coords.length % 2) return null;
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < coords.length; i += 2) {
      const x = Number(coords[i]),
        y = Number(coords[i + 1]);
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
    }
    return b;
  }
  const oceans = [
    [-145, 24, "Pacific Ocean"],
    [-36, 20, "Atlantic Ocean"],
    [77, -24, "Indian Ocean"],
    [163, -14, "Pacific Ocean"],
  ];
  const continents = [
    [-104, 46, "北美洲"],
    [-61, -13, "南美洲"],
    [17, 59, "欧洲"],
    [19, 4, "非洲"],
    [83, 52, "亚洲"],
    [135, -26, "大洋洲"],
  ];
  const mapTags = [
    [-125, 8],
    [-101, -22],
    [-135, -39],
    [-44, 38],
    [-20, -37],
    [48, -35],
    [85, -40],
    [153, 8],
    [164, 44],
    [-150, 41],
    [64, 7],
  ];
  const notable = [
    "巴黎",
    "东京",
    "新加坡",
    "纽约",
    "伦敦",
    "开罗",
    "悉尼",
    "里约热内卢",
    "开普敦",
    "洛杉矶",
    "伊斯坦布尔",
    "曼谷",
    "利马",
    "墨西哥城",
    "上海",
    "北京",
    "成都",
    "拉萨",
    "西安",
    "昆明",
    "广州",
    "哈尔滨",
    "乌鲁木齐",
    "台北",
    "香港",
    "杭州",
  ];
  const notableRank = new Map(notable.map((n, i) => [n, i]));
  const rank = (p) => notableRank.get(p.name?.replace(/市$/, "")) ?? 1000;
  const atlasCache = new WeakMap();
  const chinese = (p) => ["中国", "China", "CN"].includes(p.country);
  const maxScale = (2 ** 20 * 512) / 360;
  const taiwan = (p) =>
    p.taiwan ||
    (p.type === "city" &&
      chinese(p) &&
      p.lon >= 120 &&
      p.lon < 122.2 &&
      p.lat > 21.8 &&
      p.lat < 25.5);
  let streetLibrary;
  function streets() {
    return (streetLibrary ||= import("./street.js").catch((error) => {
      streetLibrary = null;
      throw error;
    }));
  }
  const font =
    '600 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  const countryFont =
    '700 12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';

  function sharedAtlas(places, world) {
    if (atlasCache.has(places)) return atlasCache.get(places);
    const geom = new Map();
    const grouped = new Map();
    const byId = new Map();
    const base = world
      .map((path, i) => ({
        key: String(i),
        path: asPath(path),
        box: bounds(path),
      }))
      .filter((e) => e.path);
    for (const p of places) {
      byId.set(p.id, p);
      if (p.path)
        geom.set(p.id, {
          key: p.id,
          path: asPath(p.path),
          box: bounds(p.path),
        });
      if (!grouped.has(p.type)) grouped.set(p.type, []);
      grouped.get(p.type).push(p);
    }
    const cities = grouped.get("city") || [];
    cities.push(
      ...places.filter((p) => p.type === "prefecture" && p.name.endsWith("市")),
    );
    grouped.set("city", cities);
    for (const group of grouped.values())
      group.sort((a, b) => rank(a) - rank(b));
    const listeners = new Set(),
      index = new Map(),
      files = new Map(),
      pending = new Set(),
      failures = new Map();
    const shared = {
      byId,
      geom,
      base,
      grouped,
      listeners,
      views: new Set(),
      labels: [],
      terrain: null,
      water: null,
      index,
      files,
      pending,
      failures,
    };
    atlasCache.set(places, shared);
    const repaint = () => listeners.forEach((fn) => fn());
    let loadingChina = false;
    function loadRelief(name, file) {
      const relief = new Image();
      relief.decoding = "async";
      relief.onload = () => {
        shared[name] = relief;
        repaint();
      };
      relief.src = file;
    }
    loadRelief("terrain", "./physical/terrain.jpg");
    shared.loadChina = () => {
      if (loadingChina) return;
      loadingChina = true;
      loadRelief("chinaTerrain", "./physical/china-terrain.jpg");
    };
    fetch("./physical/water.json")
      .then((r) => {
        if (!r.ok) throw Error(String(r.status));
        return r.json();
      })
      .then((data) => {
        // Delay parsing a path until its map scale and bounds make it visible.
        shared.water = {
          rivers: data.rivers.sort((a, b) => a.r - b.r),
          lakes: data.lakes.sort((a, b) => a.r - b.r),
        };
        repaint();
      })
      .catch(() => {});
    fetch("./detail/index.json")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((data) => {
        for (const group of ["world", "regions", "prefectures"]) {
          for (const entry of data[group] || [])
            index.set(String(entry.id), entry);
        }
        shared.labels = (data.labels || []).filter(
          (p) => Number.isFinite(p.lon) && Number.isFinite(p.lat),
        );
        repaint();
      })
      .catch(() => {});
    shared.load = async (file) => {
      if (
        files.has(file) ||
        pending.has(file) ||
        pending.size >= 2 ||
        Date.now() < (failures.get(file) || 0)
      )
        return;
      pending.add(file);
      try {
        const response = await fetch(file);
        if (!response.ok) throw Error(String(response.status));
        const json = await response.json();
        const paths = new Map();
        for (const [key, d] of Object.entries(json)) paths.set(key, asPath(d));
        files.set(file, paths);
        // Keep the most recently used groups, independent of how many times the user pans.
        if (files.size > 12) {
          for (const f of files.keys()) {
            if (![...shared.views].some((view) => view.has(f))) files.delete(f);
            if (files.size <= 12) break;
          }
        }
        failures.delete(file);
      } catch {
        failures.set(file, Date.now() + 60000);
      } finally {
        pending.delete(file);
        repaint();
      }
    };
    return shared;
  }

  // A label's first available scale is solved in geographic coordinates. Lower
  // levels retain their slots at every higher level, independently of the camera.
  function makePlacement(nodes) {
    const accepted = [],
      levels = [];
    let nextScale = 0.48;
    const gridKey = (x, y) => x + "," + y;
    return function place(scale) {
      while (nextScale <= scale * 1.000001) {
        const level = nextScale,
          grid = new Map();
        function cells(n, fn) {
          const x = n.wx * level,
            y = n.wy * level;
          for (
            let i = Math.floor((x - n.rx) / 64);
            i <= Math.floor((x + n.rx) / 64);
            i++
          ) {
            for (
              let j = Math.floor((y - n.ry) / 64);
              j <= Math.floor((y + n.ry) / 64);
              j++
            ) {
              if (fn(gridKey(i, j))) return true;
            }
          }
          return false;
        }
        function occupy(n) {
          cells(n, (k) => {
            let bucket = grid.get(k);
            if (!bucket) grid.set(k, (bucket = []));
            bucket.push(n);
          });
        }
        for (const n of accepted) occupy(n);
        for (const n of nodes) {
          if (n.at || n.min > level) continue;
          if (
            cells(n, (k) =>
              grid
                .get(k)
                ?.some(
                  (other) =>
                    Math.abs(n.wx - other.wx) * level < n.rx + other.rx &&
                    Math.abs(n.wy - other.wy) * level < n.ry + other.ry,
                ),
            )
          )
            continue;
          n.at = level;
          accepted.push(n);
          occupy(n);
        }
        levels.push({ scale: level, count: accepted.length });
        nextScale *= Math.SQRT2;
      }
      // Levels were added in increasing order and accepted nodes never leave them.
      let end = levels.length - 1;
      while (end >= 0 && levels[end].scale > scale * 1.000001) end--;
      return end < 0 ? [] : accepted.slice(0, levels[end].count);
    };
  }

  function createMap(root, { places, world, onSelect, stats = false }) {
    const canvas = document.createElement("canvas");
    root.classList.add("tt-atlas");
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "group");
    canvas.setAttribute(
      "aria-label",
      stats
        ? "旅行记录地图。方向键平移，加减号缩放，回车打开中心附近的记录。"
        : "旅行地图。方向键平移，加减号缩放，回车打开中心附近的地点。",
    );
    root.replaceChildren(canvas);
    const c = canvas.getContext("2d");
    const shared = sharedAtlas(places, world);
    const { byId, geom, base, grouped } = shared;
    const chinaBase = (grouped.get("region") || [])
      .filter(chinese)
      .map((p) => geom.get(p.id))
      .filter(Boolean);
    const taiwanBase = (grouped.get("prefecture") || [])
      .filter(taiwan)
      .map((p) => geom.get(p.id))
      .filter(Boolean);
    const countryForShape = new Map();
    for (const p of grouped.get("country") || [])
      for (const id of p.worldIds || []) countryForShape.set(id, p);
    const credit = document.createElement("div");
    credit.className = "street-credit";
    credit.hidden = true;
    credit.innerHTML =
      '<span aria-live="polite"></span> <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
    root.append(credit);
    let streetEngine,
      streetPending = false,
      unsubStreet,
      streetRetry = 0,
      countryAreas = [];
    function renderStreets() {
      const enabled = scale >= (512 * 64) / 360;
      credit.hidden = !enabled;
      if (!enabled) return;
      if (!streetEngine && !streetPending && Date.now() > streetRetry) {
        streetPending = true;
        streets()
          .then((module) => {
            if (disposed) return;
            streetEngine = module;
            unsubStreet = module.subscribe(paint);
            paint();
          })
          .catch(() => {
            streetRetry = Date.now() + 30000;
            paint();
          })
          .finally(() => (streetPending = false));
      }
      const status =
        streetEngine?.paintStreets(c, {
          clip,
          scale,
          px,
          w,
          h,
          scope: state.scope,
          allowRequests: !motion && !pointers.size,
        }) || (streetRetry > Date.now() ? "offline" : "loading");
      const notice =
        status === "loading"
          ? "街道加载中"
          : status === "offline"
            ? "街道暂不可用 · 离线底图"
            : "";
      if (credit.firstChild.textContent !== notice)
        credit.firstChild.textContent = notice;
    }
    let state = {
      scope: "world",
      layer: stats ? "records" : "country",
      records: {},
      selected: null,
    };
    let placement = null,
      layoutKey = "",
      geoLabels = null,
      motion = null,
      disposed = false;
    let requested = new Set(),
      loadTimer = 0;
    let w = 1,
      h = 1,
      px = 1,
      scale = 1,
      baseScale = 1,
      cx = 180,
      cy = 70,
      frame = 0;
    let points = [],
      areas = [],
      clip = [],
      filtered = [],
      pointers = new Map(),
      tap = null;
    function worldCoord(x, y) {
      return { x: (x - w / 2) / scale + cx, y: (y - h / 2) / scale + cy };
    }
    function screen(x, y) {
      return { x: (x - cx) * scale + w / 2, y: (y - cy) * scale + h / 2 };
    }
    function refreshFilter() {
      const list =
        state.layer === "records"
          ? Object.keys(state.records || {})
              .map((id) => byId.get(id))
              .filter(Boolean)
              .sort(
                (a, b) =>
                  (a.type === "region" ? -1 : 0) -
                  (b.type === "region" ? -1 : 0),
              )
          : grouped.get(state.layer) || [];
      filtered =
        state.scope === "taiwan"
          ? list.filter(taiwan)
          : state.scope === "china"
            ? list.filter(chinese)
            : list;
    }
    function fit() {
      motion = null;
      const island = state.scope === "taiwan",
        china = state.scope === "china";
      cx = island ? 300.7 : china ? 284 : 180;
      cy = island ? 66.3 : china ? 55 : 73;
      baseScale = island
        ? Math.min(w / 6.7, h / 5.8)
        : china
          ? Math.min(w / 69, h / 46)
          : Math.min(w / 362, h / 150);
      scale = baseScale;
      if (!stats && !island && !china && h > w * 1.15) {
        cx = 282;
        cy = 62;
        scale = Math.max(baseScale, Math.min(w / 91, h / 102));
      }
      paint();
    }
    function limit() {
      const china = state.scope === "china";
      const ext =
        state.scope === "taiwan"
          ? [297.5, 62.5, 303, 68.9]
          : china
            ? [248, 32, 319, 75]
            : [0, 0, 360, 180];
      const marginX = (w / scale) * 0.33,
        marginY = (h / scale) * 0.33;
      cx = clamp(
        cx,
        Math.min((ext[0] + ext[2]) / 2, ext[0] + marginX),
        Math.max((ext[0] + ext[2]) / 2, ext[2] - marginX),
      );
      const centerY = state.scope === "taiwan" ? 66.3 : china ? 55 : 73;
      cy = clamp(
        cy,
        Math.min(centerY, ext[1] + marginY),
        Math.max(centerY, ext[3] - marginY),
      );
    }
    function setAnchoredScale(value, anchor, position) {
      scale = clamp(value, baseScale, Math.max(baseScale, maxScale));
      cx = position.x - (anchor.x - w / 2) / scale;
      cy = position.y - (anchor.y - h / 2) / scale;
      limit();
    }
    function zoom(k, anchor = { x: w / 2, y: h / 2 }) {
      if (!Number.isFinite(k) || k <= 0) return;
      const target = clamp(
        (motion?.target || scale) * k,
        baseScale,
        Math.max(baseScale, maxScale),
      );
      const position = worldCoord(anchor.x, anchor.y);
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        motion = null;
        setAnchoredScale(target, anchor, position);
      } else {
        motion = {
          start: performance.now(),
          from: scale,
          target,
          anchor,
          position,
        };
      }
      paint();
    }
    function stepMotion(time) {
      if (!motion) return;
      const { start, from, target, anchor, position } = motion;
      const t = clamp((time - start) / 200, 0, 1);
      setAnchoredScale(
        from * Math.exp(Math.log(target / from) * (1 - Math.pow(1 - t, 3))),
        anchor,
        position,
      );
      if (t >= 1) motion = null;
      else paint();
    }
    function paint() {
      if (!disposed && !frame) frame = requestAnimationFrame(draw);
    }
    function visible(b) {
      return (
        !b ||
        !(b[0] > clip[2] || b[2] < clip[0] || b[1] > clip[3] || b[3] < clip[1])
      );
    }
    function line(x1, y1, x2, y2) {
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
    }
    function roundedLabel(label, x, y, color, active) {
      c.font =
        '600 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      const tw = c.measureText(label).width;
      c.lineJoin = "round";
      c.strokeStyle = active ? "#fffdfa" : "#f6efdc";
      c.lineWidth = 3.5;
      c.strokeText(label, x - tw / 2, y);
      c.fillStyle = color;
      c.fillText(label, x - tw / 2, y);
    }
    function drawWater() {
      const step =
        [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 45, 90].find(
          (s) => s * scale > 58,
        ) || 90;
      c.strokeStyle = palette.grid;
      c.lineWidth = 0.7;
      c.setLineDash([2, 4]);
      for (
        let x = Math.ceil((clip[0] - 180) / step) * step + 180;
        x <= clip[2];
        x += step
      ) {
        const a = screen(x, 0);
        line(a.x, 0, a.x, h);
      }
      for (
        let y = Math.ceil((clip[1] - 90) / step) * step + 90;
        y <= clip[3];
        y += step
      ) {
        const a = screen(0, y);
        line(0, a.y, w, a.y);
      }
      c.setLineDash([]);
      if (state.scope !== "world" || scale > 9) return;
      c.strokeStyle = "#95bebc";
      c.lineWidth = 1;
      for (const [lon, lat] of mapTags) {
        const a = screen(lon + 180, 90 - lat);
        c.beginPath();
        for (let j = 0; j < 3; j++) {
          const x = a.x + j * 6;
          c.moveTo(x, a.y);
          c.quadraticCurveTo(x + 1.7, a.y + 2.4, x + 4, a.y);
        }
        c.stroke();
      }
    }
    function shapeVisible(e) {
      const meta = scale >= 18 && shared.index.get(e.key);
      if (!meta) return visible(e.box);
      const overlaps = (box) =>
        !(
          box[0] + 180 > clip[2] ||
          box[2] + 180 < clip[0] ||
          90 - box[3] > clip[3] ||
          90 - box[1] < clip[1]
        );
      return overlaps(meta.bbox) && (!meta.boxes || meta.boxes.some(overlaps));
    }
    function pathFor(e) {
      if (scale < 18) return e.path;
      const meta = shared.index.get(e.key);
      if (!meta) return e.path;
      let chunk = shared.files.get(meta.file);
      if (chunk) {
        // Update recency once per frame for a group of adjacent polygons.
        if (!requested.has(meta.file)) {
          shared.files.delete(meta.file);
          shared.files.set(meta.file, chunk);
        }
      }
      requested.add(meta.file);
      return chunk?.get(e.key) || e.path;
    }
    function loadVisible() {
      if (loadTimer || motion || pointers.size || !requested.size) return;
      loadTimer = setTimeout(() => {
        loadTimer = 0;
        if (disposed || motion || pointers.size) return;
        for (const file of requested) {
          if (shared.pending.size >= 2) break;
          if (!shared.files.has(file)) shared.load(file);
        }
      }, 75);
    }
    function physical() {
      if (!shared.terrain && !shared.water) return;
      // Each country or province is filled individually into the transparent canvas.
      // source-atop keeps terrain and waterways within that union, including its holes.
      c.save();
      c.globalCompositeOperation = "source-atop";
      // The higher resolution China raster is an exact crop of the same source.
      const chinaBox = [252, 35, 316, 75];
      if (visible(chinaBox) && (state.scope === "china" || scale > 16))
        shared.loadChina();
      const china = visible(chinaBox) ? shared.chinaTerrain : null;
      c.imageSmoothingEnabled = true;
      c.globalAlpha = clamp(
        0.9 - Math.max(0, Math.log2(scale / 12)) * 0.075,
        0.36,
        0.9,
      );
      function drawTerrain(image, box) {
        if (!image) return;
        const x = Math.max(clip[0], box[0]),
          y = Math.max(clip[1], box[1]);
        const width = Math.min(clip[2], box[2]) - x,
          height = Math.min(clip[3], box[3]) - y;
        if (width <= 0 || height <= 0) return;
        const dx = image.naturalWidth / (box[2] - box[0]),
          dy = image.naturalHeight / (box[3] - box[1]);
        c.drawImage(
          image,
          (x - box[0]) * dx,
          (y - box[1]) * dy,
          width * dx,
          height * dy,
          x,
          y,
          width,
          height,
        );
      }
      if (china) {
        if (
          clip[0] < chinaBox[0] ||
          clip[2] > chinaBox[2] ||
          clip[1] < chinaBox[1] ||
          clip[3] > chinaBox[3]
        ) {
          c.save();
          c.beginPath();
          c.rect(0, 0, 360, 180);
          c.rect(252, 35, 64, 40);
          c.clip("evenodd");
          drawTerrain(shared.terrain, [0, 0, 360, 180]);
          c.restore();
        }
        drawTerrain(china, chinaBox);
      } else drawTerrain(shared.terrain, [0, 0, 360, 180]);
      c.globalAlpha = 1;
      if (shared.water) {
        const maxRank = clamp(Math.floor(2 + Math.log2(scale) * 1.4), 2, 12);
        for (const layer of ["lakes", "rivers"]) {
          const river = layer === "rivers";
          c.strokeStyle = river ? "#70a4af" : "#84b4b7";
          c.fillStyle = "#a3cbd0";
          for (const item of shared.water[layer]) {
            if (item.r > maxRank) break;
            if (!visible(item.b)) continue;
            if (!item.path) {
              item.path = asPath(item.d);
              delete item.d;
            }
            if (!item.path) continue;
            c.lineWidth =
              (river
                ? clamp(
                    0.7 + Math.log2(scale + 1) * 0.13 - item.r * 0.07,
                    0.4,
                    1.7,
                  )
                : 0.5) / scale;
            if (!river) c.fill(item.path, "evenodd");
            c.stroke(item.path);
          }
        }
      }
      c.restore();
    }
    function land() {
      c.save();
      c.translate(w / 2 - cx * scale, h / 2 - cy * scale);
      c.scale(scale, scale);
      c.lineJoin = "round";
      c.lineCap = "round";
      c.fillStyle = palette.land;
      c.strokeStyle = palette.border;
      c.lineWidth = 0.7 / scale;
      const shapes = [];
      countryAreas = [];
      for (const e of state.scope === "taiwan"
        ? taiwanBase
        : state.scope === "china"
          ? chinaBase
          : base) {
        if (!shapeVisible(e)) continue;
        const path = pathFor(e);
        shapes.push(path);
        if (state.scope === "world" && countryForShape.has(e.key))
          countryAreas.push({ p: countryForShape.get(e.key), e, path });
        c.fill(path, "evenodd");
      }
      if (shapes.length) physical();
      renderStreets();
      for (const path of shapes) c.stroke(path);
      const isArea =
        state.layer === "region" ||
        state.layer === "prefecture" ||
        state.layer === "records" ||
        state.layer === "country";
      areas = [];
      if (isArea) {
        for (const p of filtered) {
          const e = geom.get(p.id);
          if (!e || !shapeVisible(e)) continue;
          const path = pathFor(e);
          areas.push({ p, e, path });
          const stat = statusOf(state.records, p.id),
            selected = state.selected === p.id;
          if (stat || selected) {
            c.globalAlpha = scale > 1024 ? 0.28 : 1;
            c.fillStyle =
              stat === "visited"
                ? "rgba(86,159,122,.55)"
                : stat === "wish"
                  ? "rgba(223,140,105,.54)"
                  : "rgba(211,174,108,.55)";
            c.fill(path, "evenodd");
            c.globalAlpha = 1;
          }
          c.strokeStyle = selected
            ? "#624830"
            : stat === "visited"
              ? palette.visited
              : stat === "wish"
                ? palette.wish
                : scale > 7
                  ? "#bcad8e"
                  : "rgba(165,153,123,.48)";
          c.lineWidth =
            (selected ? 2 : stat ? 1.15 : scale > 7 ? 0.55 : 0.35) / scale;
          c.stroke(path);
        }
      }
      c.restore();
    }
    function geography() {
      c.textAlign = "center";
      c.textBaseline = "middle";
      if (state.scope === "world" && scale < 7) {
        const fs = clamp(scale * 3 + 5, 9, 14);
        c.font = "italic " + fs + 'px Georgia, "Times New Roman", serif';
        c.fillStyle = palette.waterInk;
        for (const [lon, lat, name] of oceans) {
          const a = screen(lon + 180, 90 - lat);
          c.fillText(name, a.x, a.y);
        }
        c.font =
          "600 " +
          clamp(scale * 1.6 + 7, 9, 12) +
          'px -apple-system, "PingFang SC", sans-serif';
        c.fillStyle = "#817d66";
        for (const [lon, lat, name] of continents) {
          const a = screen(lon + 180, 90 - lat);
          c.fillText(name, a.x, a.y);
        }
      }
      c.textAlign = "left";
      c.textBaseline = "alphabetic";
    }
    // Small map symbols double as hit targets for their destination.
    const illustrations = {
      巴黎: [
        [
          "M-1 -25 L1 -25 L2 -17 L4 -10 L8 -2 L4 -2 Q0 -10 -4 -2 L-8 -2 L-4 -10 L-2 -17 Z",
          "#d99c72",
        ],
        ["M-3 -15 L3 -15 M-5 -9 L5 -9 M0 -28 L0 -24", "none"],
      ],
      东京: [
        ["M-12 -3 L-2 -17 L1 -20 L4 -16 L14 -3 Z", "#89b4a5"],
        ["M-6 -12 L1 -20 L7 -12 L3 -13 L1 -12 L-1 -15 L-3 -12 Z", "#fff8d9"],
        ["M-9 -3 L12 -3", "none"],
      ],
      纽约: [
        [
          "M-9 -2 L-9 -11 L-6 -11 L-6 -16 L-3 -16 L-3 -21 L-1 -21 L-1 -25 L1 -25 L1 -21 L3 -21 L3 -15 L5 -15 L5 -10 L9 -10 L9 -2 Z",
          "#b4c6ad",
        ],
        ["M-5 -7 L-5 -12 M0 -6 L0 -18 M4 -5 L4 -9 M-11 -2 L11 -2", "none"],
      ],
      开罗: [
        ["M-13 -3 L-2 -18 L9 -3 Z", "#e2af71"],
        ["M-2 -18 L3 -3 L9 -3 Z", "#c79163"],
        ["M3 -3 L9 -12 L16 -3 Z", "#f0cb8b"],
      ],
      悉尼: [
        ["M-12 -4 Q-9 -5 -12 -15 Q-3 -13 1 -4 Z", "#f8f1d9"],
        ["M-4 -4 Q0 -8 -2 -18 Q8 -14 8 -4 Z", "#fff9e7"],
        ["M3 -4 Q8 -12 15 -12 Q12 -7 12 -4 Z", "#eddab4"],
        ["M-13 -3 L13 -3 L11 -1 L-11 -1 Z", "#c58f69"],
      ],
    };
    function drawIllustration(p, x, y) {
      const shapes = illustrations[p.name];
      if (!shapes) return;
      c.save();
      c.translate(x, y - 2);
      c.scale(0.92, 0.92);
      c.lineJoin = "round";
      c.lineCap = "round";
      c.strokeStyle = "#736e54";
      c.lineWidth = 1.1;
      for (const [d, tint] of shapes) {
        const path = new Path2D(d);
        if (tint !== "none") {
          c.fillStyle = tint;
          c.fill(path);
        }
        c.stroke(path);
      }
      c.restore();
    }
    function placeLayout() {
      const special = Object.keys(state.records || {})
        .sort()
        .join(",");
      const key = [
        state.scope,
        state.layer,
        state.selected || "",
        special,
      ].join("|");
      if (placement && key === layoutKey && geoLabels === shared.labels) return;
      layoutKey = key;
      geoLabels = shared.labels;
      const nodes = [];
      function add(
        p,
        { geo = false, label = p.name, min = 0, priority = 3 } = {},
      ) {
        c.font = geo ? countryFont : font;
        const rx = c.measureText(label).width / 2 + 5;
        nodes.push({
          p,
          label,
          geo,
          min,
          priority,
          wx: +p.lon + 180,
          wy: 90 - +p.lat,
          rx: Math.max(6, rx),
          ry: geo ? 10 : 17,
          at: 0,
        });
      }
      if (state.scope === "world" && state.layer !== "country") {
        const names =
          typeof Intl.DisplayNames === "function"
            ? new Intl.DisplayNames(["zh-Hans"], {
                type: "region",
                style: "short",
              })
            : null;
        for (const p of geoLabels) {
          const cc = p.id;
          const flag =
            /^[A-Z]{2}$/.test(cc) && (!cc.startsWith("X") || cc === "XK")
              ? String.fromCodePoint(
                  ...[...cc].map((ch) => 127397 + ch.charCodeAt(0)),
                ) + " "
              : "";
          add(p, {
            geo: true,
            label: flag + (flag && names ? names.of(cc) : p.name),
            min: 0.8 * Math.pow(1.72, Math.max(0, (p.rank || 4) - 1)),
            priority: 2,
          });
        }
      }
      for (const p of filtered) {
        const saved = statusOf(state.records, p.id),
          selected = p.id === state.selected;
        const isArea = state.layer === "region" || state.layer === "prefecture";
        const min =
          saved || selected
            ? 0
            : isArea
              ? state.scope === "china"
                ? 4
                : 7
              : rank(p) < 1000
                ? 0.65
                : 3.5;
        const flag =
          p.type === "country" && /^[A-Z]{2}$/.test(p.countryCode)
            ? String.fromCodePoint(
                ...[...p.countryCode].map((ch) => 127397 + ch.charCodeAt(0)),
              ) + " "
            : "";
        add(p, {
          label: flag + p.name,
          min:
            p.type === "country" && !saved && !selected
              ? 0.7 * 1.72 ** (p.labelRank - 1)
              : min,
          priority: selected
            ? 0
            : saved
              ? 1
              : p.type === "country"
                ? 2 + p.labelRank / 20
                : rank(p) < 1000
                  ? 2.5
                  : 3,
        });
      }
      nodes.sort(
        (a, b) =>
          a.priority - b.priority ||
          a.min - b.min ||
          rank(a.p) - rank(b.p) ||
          String(a.p.id).localeCompare(String(b.p.id)),
      );
      placement = makePlacement(nodes);
    }
    function pins() {
      placeLayout();
      const shown = placement(scale),
        visibleIds = new Set();
      points = [];
      function point(p, label, labelRadius = 0, text = p.name) {
        const { x, y } = screen(+p.lon + 180, 90 - +p.lat);
        if (x < -130 || x > w + 130 || y < -40 || y > h + 40) return;
        const stat = statusOf(state.records, p.id),
          sel = p.id === state.selected;
        const illustrated =
          state.scope === "world" &&
          state.layer === "city" &&
          scale < 8 &&
          w > 440 &&
          Object.hasOwn(illustrations, p.name);
        points.push({
          p,
          x,
          y,
          sel,
          stat,
          label,
          labelRadius,
          illustrated,
          text,
        });
      }
      for (const n of shown) {
        const a = screen(n.wx, n.wy);
        if (n.geo) {
          if (a.x < -n.rx || a.x > w + n.rx || a.y < -20 || a.y > h + 20)
            continue;
          c.save();
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.font = countryFont;
          c.lineJoin = "round";
          c.strokeStyle = "#f8f0dbe8";
          c.lineWidth = 3;
          c.strokeText(n.label, a.x, a.y);
          c.fillStyle = "#68674f";
          c.fillText(n.label, a.x, a.y);
          c.restore();
        } else {
          visibleIds.add(n.p.id);
          point(n.p, true, n.rx, n.label);
        }
      }
      // A recorded marker remains selectable even if its label cannot yet fit.
      for (const p of filtered) {
        if (
          !visibleIds.has(p.id) &&
          (p.id === state.selected || statusOf(state.records, p.id))
        )
          point(p, false);
      }
      points.sort(
        (a, b) =>
          Number(b.sel) - Number(a.sel) || Number(!!b.stat) - Number(!!a.stat),
      );
      for (const { p, x, y, sel, stat, label, illustrated, text } of [
        ...points,
      ].reverse()) {
        const color =
          stat === "visited"
            ? palette.visited
            : stat === "wish"
              ? palette.wish
              : palette.ink;
        if (sel || stat) {
          if (sel) {
            c.beginPath();
            c.fillStyle = "rgba(87,79,59,.15)";
            c.arc(x, y - 3, 12, 0, 2 * Math.PI);
            c.fill();
          }
          c.beginPath();
          c.moveTo(x, y + 1);
          c.bezierCurveTo(x - 2, y - 2, x - 7, y - 6, x - 7, y - 10);
          c.arc(x, y - 10, 7, Math.PI, 2 * Math.PI);
          c.bezierCurveTo(x + 7, y - 6, x + 2, y - 2, x, y + 1);
          c.fillStyle = color;
          c.fill();
          c.strokeStyle = "#fff5df";
          c.lineWidth = 1.6;
          c.stroke();
          c.beginPath();
          c.fillStyle = "#fff5df";
          c.arc(x, y - 10, 2.4, 0, 2 * Math.PI);
          c.fill();
        } else if (illustrated) {
          drawIllustration(p, x, y);
        } else {
          const r = rank(p) < 1000 ? 3.3 : 2.2;
          c.beginPath();
          c.arc(x, y, r, 0, 2 * Math.PI);
          c.fillStyle = rank(p) < 1000 ? "#ad6c43" : "#827b60";
          c.fill();
          c.strokeStyle = "#fffae7";
          c.lineWidth = 1;
          c.stroke();
        }
        if (label) roundedLabel(text, x, y + 16, color, sel || stat);
      }
    }
    function compass() {
      if (w < 270 || h < 185) return;
      c.save();
      c.translate(31, h - 32);
      c.strokeStyle = "rgba(69,100,89,.52)";
      c.lineWidth = 0.8;
      c.beginPath();
      c.arc(0, 0, 13, 0, 2 * Math.PI);
      c.stroke();
      line(-18, 0, 18, 0);
      line(0, -18, 0, 18);
      c.beginPath();
      c.moveTo(0, -17);
      c.lineTo(4, 5);
      c.lineTo(0, 2);
      c.closePath();
      c.fillStyle = "#637d6d";
      c.fill();
      c.beginPath();
      c.moveTo(0, -17);
      c.lineTo(-4, 5);
      c.lineTo(0, 2);
      c.closePath();
      c.fillStyle = "#f6ecd2";
      c.fill();
      c.stroke();
      c.font = "bold 9px Georgia,serif";
      c.textAlign = "center";
      c.fillStyle = "#516f65";
      c.fillText("N", 0, -22);
      c.restore();
    }
    function draw(time) {
      frame = 0;
      requested.clear();
      if (!root.clientWidth || !root.clientHeight) return;
      stepMotion(time);
      const a = worldCoord(0, 0),
        b = worldCoord(w, h);
      clip = [a.x, a.y, b.x, b.y];
      c.setTransform(px, 0, 0, px, 0, 0);
      c.clearRect(0, 0, w, h);
      land();
      c.save();
      c.globalCompositeOperation = "destination-over";
      drawWater();
      c.fillStyle = palette.sea;
      c.fillRect(0, 0, w, h);
      c.restore();
      geography();
      pins();
      compass();
      loadVisible();
    }
    function hit(x, y) {
      let best = null,
        score = Infinity;
      for (const q of points) {
        // The painted name is part of the same touch target as its pin.
        if (
          q.label &&
          Math.abs(x - q.x) <= q.labelRadius &&
          y >= q.y + 3 &&
          y <= q.y + 21
        )
          return q.p.id;
        const d = dist(
          { x, y },
          { x: q.x, y: q.y - (q.illustrated ? 10 : q.stat || q.sel ? 6 : 0) },
        );
        if (d < 16 && d < score) {
          best = q.p;
          score = d;
        }
      }
      if (best) return best.id;
      const a = worldCoord(x, y);
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      for (const { p, e, path } of [
        ...(stats ? [] : countryAreas),
        ...areas,
      ].reverse()) {
        if (
          path === e.path &&
          e.box &&
          (a.x < e.box[0] || a.y < e.box[1] || a.x > e.box[2] || a.y > e.box[3])
        )
          continue;
        if (c.isPointInPath(path, a.x, a.y, "evenodd")) {
          best = p;
          break;
        }
      }
      c.restore();
      return best?.id;
    }
    function pos(event) {
      const r = canvas.getBoundingClientRect();
      return { x: event.clientX - r.left, y: event.clientY - r.top };
    }
    canvas.onpointerdown = (e) => {
      if (e.button !== 0) return;
      motion = null;
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      pointers.set(e.pointerId, p);
      tap = pointers.size === 1 ? p : null;
    };
    canvas.onpointermove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      const old = [...pointers.values()],
        p = pos(e);
      pointers.set(e.pointerId, p);
      const next = [...pointers.values()];
      if (next.length === 1) {
        cx -= (p.x - old[0].x) / scale;
        cy -= (p.y - old[0].y) / scale;
        if (tap && dist(tap, p) > 4) tap = null;
      } else if (next.length === 2) {
        const mid = (arr) => ({
          x: (arr[0].x + arr[1].x) / 2,
          y: (arr[0].y + arr[1].y) / 2,
        });
        const a = mid(old),
          b = mid(next);
        const position = worldCoord(a.x, a.y);
        setAnchoredScale(
          (scale * dist(...next)) / Math.max(1, dist(...old)),
          b,
          position,
        );
      }
      limit();
      paint();
    };
    canvas.onpointerup = (e) => {
      const p = pos(e);
      if (tap && pointers.size === 1 && dist(p, tap) <= 5) {
        const id = hit(p.x, p.y);
        if (id) onSelect?.(id);
      }
      pointers.delete(e.pointerId);
      tap = null;
      paint();
    };
    canvas.onpointercancel = canvas.onlostpointercapture = (e) => {
      pointers.delete(e.pointerId);
      tap = null;
      paint();
    };
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta =
          e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? h : 1);
        zoom(Math.exp(-clamp(delta, -120, 120) * 0.003), pos(e));
      },
      { passive: false },
    );
    canvas.ondblclick = (e) => zoom(2, pos(e));
    canvas.onkeydown = (e) => {
      switch (e.key) {
        case "ArrowLeft":
          cx -= 48 / scale;
          break;
        case "ArrowRight":
          cx += 48 / scale;
          break;
        case "ArrowUp":
          cy -= 48 / scale;
          break;
        case "ArrowDown":
          cy += 48 / scale;
          break;
        case "+":
        case "=":
          zoom(1.6);
          break;
        case "-":
          zoom(1 / 1.6);
          break;
        case "Home":
          fit();
          break;
        case "Enter": {
          const p = [...points].sort(
            (a, b) =>
              dist(a, { x: w / 2, y: h / 2 }) - dist(b, { x: w / 2, y: h / 2 }),
          )[0];
          if (p) onSelect?.(p.p.id);
          break;
        }
        default:
          return;
      }
      e.preventDefault();
      limit();
      paint();
    };
    function resized() {
      if (!root.clientWidth || !root.clientHeight) return;
      const initial = w === 1 && h === 1,
        ratio = scale / baseScale,
        oldX = cx,
        oldY = cy;
      w = root.clientWidth;
      h = root.clientHeight;
      px = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.ceil(w * px);
      canvas.height = Math.ceil(h * px);
      fit();
      if (!initial && ratio > 1.01) {
        cx = oldX;
        cy = oldY;
        scale *= ratio;
        limit();
      }
    }
    const observer = new ResizeObserver(resized);
    shared.views.add(requested);
    shared.listeners.add(paint);
    observer.observe(root);
    refreshFilter();
    resized();
    return {
      update(next) {
        const change = next.scope !== undefined && next.scope !== state.scope;
        state = { ...state, ...next };
        refreshFilter();
        if (change) fit();
        else paint();
      },
      focus(id, options = {}) {
        const p = byId.get(id);
        if (!p) return;
        motion = null;
        state.selected = id;
        cx = Number(p.lon) + 180;
        cy = 90 - Number(p.lat);
        const b = geom.get(id)?.box;
        if (options.street) scale = (512 * 2 ** 16) / 360;
        else if (b)
          scale = clamp(
            Math.min(
              w / (Math.max(0.2, b[2] - b[0]) * 1.6),
              h / (Math.max(0.2, b[3] - b[1]) * 1.6),
            ),
            baseScale,
            Math.max(baseScale, maxScale),
          );
        else scale = Math.max(baseScale * 2.5, scale);
        limit();
        paint();
      },
      reset: fit,
      zoom,
      destroy() {
        disposed = true;
        unsubStreet?.();
        credit.remove();
        shared.views.delete(requested);
        shared.listeners.delete(paint);
        clearTimeout(loadTimer);
        observer.disconnect();
        cancelAnimationFrame(frame);
        canvas.remove();
      },
    };
  }
  let active;
  const instances = new WeakMap();
  window.TravelMap = {
    mount(root, options) {
      instances.get(root)?.destroy();
      const instance = createMap(root, options);
      instances.set(root, instance);
      if (!options.stats) active = instance;
      return instance;
    },
    update(next) {
      active?.update(next);
    },
    focus(id) {
      active?.focus(id);
    },
    zoom(factor) {
      active?.zoom(factor);
    },
    reset() {
      active?.reset();
    },
  };
})();
