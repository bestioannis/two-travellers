import * as maplibregl from "./maplibre-gl.mjs";
const collection = (features) => ({ type: "FeatureCollection", features });
const feature = (geometry, properties = {}) => ({
  type: "Feature",
  geometry,
  properties,
});
const empty = () => collection([]);
const detailed = new Map(),
  pending = new Map();
const getJSON = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw Error(url);
    return r.json();
  });
const detailIndex = getJSON("./detail/index.json");
const metroIndex = getJSON("./metro-index.json");
const font = ["Noto Sans Regular"];
// The existing atlas stores actual coordinates as longitude+180, 90-latitude.
function geometry(path) {
  const rings = (path?.match(/M[^M]+/g) || [])
    .map((s) => {
      const values = s.match(/-?(?:\d*\.)?\d+/g).map(Number),
        ring = [];
      for (let i = 0; i < values.length; i += 2)
        ring.push([values[i] - 180, 90 - values[i + 1]]);
      if (
        ring.length &&
        (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
      )
        ring.push(ring[0]);
      return ring;
    })
    .filter((r) => r.length >= 4);
  const area = (r) =>
    Math.abs(
      r.reduce(
        (s, p, i) => (i ? s + r[i - 1][0] * p[1] - p[0] * r[i - 1][1] : s),
        0,
      ),
    );
  const contains = (p, r) => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if (
        r[i][1] > p[1] !== r[j][1] > p[1] &&
        p[0] <
          ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) +
            r[i][0]
      )
        inside = !inside;
    return inside;
  };
  rings.sort((a, b) => area(b) - area(a));
  const polygons = [];
  for (const ring of rings) {
    const parent = polygons.find((p) => contains(ring[0], p[0]));
    if (parent) parent.push(ring);
    else polygons.push([ring]);
  }
  return { type: "MultiPolygon", coordinates: polygons };
}
function decodeLine(encoded) {
  let i = 0,
    x = 0,
    y = 0;
  const coordinates = [];
  const delta = () => {
    let n = 0,
      bits = 0,
      v;
    do {
      v = encoded.charCodeAt(i++) - 63;
      n |= (v & 31) << bits;
      bits += 5;
    } while (v >= 32);
    return n & 1 ? ~(n >> 1) : n >> 1;
  };
  while (i < encoded.length) {
    x += delta();
    y += delta();
    coordinates.push([x / 1e5, y / 1e5]);
  }
  return coordinates;
}
function boundsOf(g) {
  let w = 180,
    s = 90,
    e = -180,
    n = -90;
  for (const poly of g.coordinates)
    for (const ring of poly)
      for (const [x, y] of ring) {
        w = Math.min(w, x);
        s = Math.min(s, y);
        e = Math.max(e, x);
        n = Math.max(n, y);
      }
  return [w, s, e, n];
}
const color = [
  "match",
  ["get", "status"],
  "visited",
  "#5ae5b2",
  "wish",
  "#ffb186",
  "#f7e8bd",
];
const instances = new WeakMap();
function mount(root, { places, world, onSelect, stats = false }) {
  instances.get(root)?.destroy();
  root.replaceChildren();
  root.classList.add("globe-atlas");
  let state = {
      scope: "world",
      layer: stats ? "records" : "country",
      records: {},
      selected: "",
      transit: !stats,
      railway: false,
    },
    loaded = false,
    disposed = false,
    revision = 0,
    metroRevision = 0;
  const byId = new Map(places.map((p) => [p.id, p])),
    coarse = new Map(),
    fine = new Map(),
    metroFiles = new Map();
  for (const p of places) if (p.path) coarse.set(p.id, geometry(p.path));
  const china = coarse.get("country-CN");
  const style = {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    projection: { type: "globe" },
    sources: {
      satellite: {
        type: "raster",
        tiles: [
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          "Imagery © Esri, Vantor, Earthstar Geographics, GIS User Community",
      },
      streets: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution: "© OpenStreetMap · OpenFreeMap",
      },
      areas: { type: "geojson", data: empty(), tolerance: 0, maxzoom: 20 },
      pins: { type: "geojson", data: empty() },
      metro: {
        type: "geojson",
        data: empty(),
        tolerance: 0,
        maxzoom: 20,
        attribution: "OSM Subway Validator",
      },
      foreign: {
        type: "geojson",
        data: collection(
          world
            .filter(
              (_, i) => !byId.get("country-CN").worldIds.includes(String(i)),
            )
            .map((p) => feature(geometry(p))),
        ),
      },
    },
    layers: [
      {
        id: "space",
        type: "background",
        paint: { "background-color": "#071323" },
      },
      {
        id: "satellite",
        type: "raster",
        source: "satellite",
        paint: { "raster-fade-duration": 250 },
      },
      {
        id: "outside-china",
        type: "fill",
        source: "foreign",
        layout: { visibility: "none" },
        paint: { "fill-color": "#071323", "fill-opacity": 1 },
      },
      {
        id: "roads",
        type: "line",
        source: "streets",
        "source-layer": "transportation",
        minzoom: 12,
        filter: [
          "all",
          [
            "in",
            ["get", "class"],
            [
              "literal",
              ["motorway", "trunk", "primary", "secondary", "tertiary"],
            ],
          ],
          ["!=", ["geometry-type"], "Polygon"],
        ],
        paint: {
          "line-color": "#eee2be",
          "line-opacity": 0.55,
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 18, 2],
        },
      },
      {
        id: "railways",
        type: "line",
        source: "streets",
        "source-layer": "transportation",
        minzoom: 4,
        filter: ["==", ["get", "class"], "rail"],
        layout: { visibility: "none", "line-cap": "round" },
        paint: {
          "line-color": "#d8deef",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.6,
            10,
            1.5,
            17,
            3,
          ],
          "line-dasharray": [3, 2],
        },
      },
      {
        id: "area-hit",
        type: "fill",
        source: "areas",
        paint: { "fill-opacity": 0, "fill-color": "#ffffff" },
      },
      {
        id: "area-border",
        type: "line",
        source: "areas",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": color,
          "line-opacity": [
            "case",
            ["get", "selected"],
            1,
            ["!=", ["get", "status"], ""],
            0.9,
            0.32,
          ],
          "line-width": [
            "case",
            ["get", "selected"],
            2.5,
            ["!=", ["get", "status"], ""],
            1.8,
            0.65,
          ],
        },
      },
      {
        id: "metro-casing",
        type: "line",
        source: "metro",
        filter: ["==", ["geometry-type"], "LineString"],
        minzoom: 5,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#faf7e8",
          "line-opacity": 0.7,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            2,
            10,
            4.5,
            16,
            6,
          ],
        },
      },
      {
        id: "metro-lines",
        type: "line",
        source: "metro",
        filter: ["==", ["geometry-type"], "LineString"],
        minzoom: 5,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            1,
            10,
            2.5,
            16,
            4,
          ],
        },
      },
      {
        id: "metro-stations",
        type: "circle",
        source: "metro",
        filter: ["==", ["geometry-type"], "Point"],
        minzoom: 10,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2, 15, 4],
          "circle-color": "#fff9ea",
          "circle-stroke-color": "#333b45",
          "circle-stroke-width": 1,
        },
      },
      {
        id: "metro-labels",
        type: "symbol",
        source: "metro",
        filter: ["==", ["geometry-type"], "Point"],
        minzoom: 11,
        layout: {
          "text-field": ["get", "name"],
          "text-font": font,
          "text-size": 11,
          "text-anchor": "left",
          "text-offset": [0.6, 0],
        },
        paint: {
          "text-color": "#fff",
          "text-halo-color": "#14252c",
          "text-halo-width": 1.4,
        },
      },
      {
        id: "place-labels",
        minzoom: 4,
        type: "symbol",
        source: "streets",
        "source-layer": "place",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["state", "city", "town"]],
        ],
        layout: {
          "text-field": ["coalesce", ["get", "name:zh"], ["get", "name"]],
          "text-font": font,
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            1,
            11,
            8,
            13,
            14,
            16,
          ],
          "text-max-width": 8,
        },
        paint: {
          "text-color": "#fff7e9",
          "text-halo-color": "#1b2c32",
          "text-halo-width": 1.5,
        },
      },
      {
        id: "railway-stations",
        type: "symbol",
        source: "streets",
        "source-layer": "poi",
        minzoom: 11,
        filter: [
          "all",
          ["==", ["get", "class"], "railway"],
          ["==", ["get", "subclass"], "station"],
        ],
        layout: {
          visibility: "none",
          "text-field": ["coalesce", ["get", "name:zh"], ["get", "name"]],
          "text-font": font,
          "text-size": 11,
        },
        paint: {
          "text-color": "#f4f4ff",
          "text-halo-color": "#1b2c32",
          "text-halo-width": 1.5,
        },
      },
      {
        id: "destination-dots",
        type: "circle",
        source: "pins",
        paint: {
          "circle-color": color,
          "circle-radius": [
            "case",
            ["get", "selected"],
            7,
            ["!=", ["get", "status"], ""],
            5,
            2.5,
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      },
      {
        id: "destination-names",
        type: "symbol",
        source: "pins",
        layout: {
          "text-field": ["get", "label"],
          "icon-image": ["get", "flag"],
          "icon-optional": true,
          "icon-size": 0.7,
          "text-font": font,
          "text-size": 12,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "symbol-sort-key": [
            "case",
            ["get", "selected"],
            0,
            ["!=", ["get", "status"], ""],
            1,
            2,
          ],
        },
        paint: {
          "text-color": "#fff7e9",
          "text-halo-color": "#152d33",
          "text-halo-width": 1.5,
        },
      },
    ],
  };
  let map;
  try {
    map = new maplibregl.Map({
      container: root,
      style,
      center: [105, 25],
      zoom: stats ? 0.7 : 1.5,
      maxZoom: 19,
      minZoom: 0,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
      renderWorldCopies: false,
    });
  } catch (error) {
    root.textContent =
      "设备未能启动立体地图，请在 Safari 中开启 WebGL 并重新打开。";
    throw error;
  }
  map.addControl(
    new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }),
    "top-right",
  );
  const observer = new ResizeObserver(() => map.resize());
  observer.observe(root);
  const reduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function listed() {
    return places.filter((p) => {
      if (state.scope === "china" && p.country !== "中国") return false;
      if (state.layer === "records") return !!state.records[p.id];
      if (state.layer === "prefecture")
        return (
          p.type === "prefecture" ||
          ["cn-810000", "cn-820000"].includes(p.id) ||
          (p.type === "county" && p.parent === "海南省")
        );
      return p.type === state.layer;
    });
  }
  function render() {
    if (!loaded || disposed) return;
    const list = listed(),
      polygons = [],
      points = [];
    for (const p of list) {
      const props = {
        id: p.id,
        name: p.name,
        status: state.records[p.id]?.status || "",
        selected: state.selected === p.id,
        label: p.name,
        flag:
          p.type === "country" && /^[A-Z]{2}$/.test(p.countryCode)
            ? "flag-" + p.countryCode
            : "",
      };
      const g = fine.get(p.id) || coarse.get(p.id);
      if (g) polygons.push(feature(g, props));
      if (
        (p.type === "country" &&
          (p.labelRank || 5) <= Math.max(2, Math.floor(map.getZoom()) + 1)) ||
        (!g && p.type !== "country") ||
        props.status ||
        props.selected ||
        (p.type !== "country" && map.getZoom() > 4)
      )
        points.push(
          feature({ type: "Point", coordinates: [+p.lon, +p.lat] }, props),
        );
    }
    map.getSource("areas").setData(collection(polygons));
    map.getSource("pins").setData(collection(points));
    map.setLayoutProperty(
      "outside-china",
      "visibility",
      state.scope === "china" ? "visible" : "none",
    );
    for (const id of ["railways", "railway-stations"])
      map.setLayoutProperty(
        id,
        "visibility",
        state.railway ? "visible" : "none",
      );
    for (const id of [
      "metro-casing",
      "metro-lines",
      "metro-stations",
      "metro-labels",
    ])
      map.setLayoutProperty(
        id,
        "visibility",
        state.transit ? "visible" : "none",
      );
    for (const id of [
      "roads",
      "railways",
      "railway-stations",
      "place-labels",
    ]) {
      const original = style.layers.find((l) => l.id === id).filter;
      map.setFilter(
        id,
        state.scope === "china"
          ? ["all", original, ["within", china]]
          : original,
      );
    }
  }
  function overlaps(box) {
    const b = map.getBounds();
    return (
      box[2] >= b.getWest() &&
      box[0] <= b.getEast() &&
      box[3] >= b.getSouth() &&
      box[1] <= b.getNorth()
    );
  }
  async function fetchDetail(file) {
    if (detailed.has(file)) return detailed.get(file);
    if (!pending.has(file))
      pending.set(
        file,
        getJSON(file)
          .then((data) => {
            detailed.set(file, data);
            if (detailed.size > 12)
              detailed.delete(detailed.keys().next().value);
            return data;
          })
          .finally(() => pending.delete(file)),
      );
    return pending.get(file);
  }
  async function refine() {
    if (!loaded || disposed || map.getZoom() < 3) return;
    const token = ++revision;
    try {
      const index = await detailIndex;
      const list = listed(),
        ids = new Set(list.map((p) => p.id)),
        worldIds = new Set(list.flatMap((p) => p.worldIds || []));
      const entries = [
        ...index.world.filter((e) => worldIds.has(e.id)),
        ...index.regions.filter((e) => ids.has(e.id)),
        ...index.prefectures.filter((e) => ids.has(e.id)),
      ].filter((e) => overlaps(e.bbox));
      const files = [...new Set(entries.map((e) => e.file))];
      for (let i = 0; i < files.length; i += 2) {
        const data = await Promise.all(files.slice(i, i + 2).map(fetchDetail));
        if (disposed || token !== revision) return;
        for (const chunk of data)
          for (const [id, path] of Object.entries(chunk)) {
            if (ids.has(id)) fine.set(id, geometry(path));
          }
        for (const p of list.filter((p) => p.worldIds)) {
          const shapes = p.worldIds
            .map((id) => {
              const meta = index.world.find((e) => e.id === id);
              return meta && detailed.get(meta.file)?.[id];
            })
            .filter(Boolean);
          if (shapes.length === p.worldIds.length)
            fine.set(p.id, geometry(shapes.join("")));
        }
        render();
      }
    } catch (error) {
      console.warn("Detailed boundaries unavailable", error.message);
    }
  }
  async function metros() {
    const token = ++metroRevision;
    if (!loaded || !state.transit || disposed || map.getZoom() < 5) return;
    try {
      const index = await metroIndex;
      const files = index
        .filter(([, boxes]) => boxes.some(overlaps))
        .map(([file]) => file);
      await Promise.all(
        files.map(async (file) => {
          if (!metroFiles.has(file)) metroFiles.set(file, await getJSON(file));
        }),
      );
      if (disposed) return;
      if (token !== metroRevision) return;
      const features = [];
      for (const file of files)
        for (const [, box, lines, stations] of metroFiles.get(file)) {
          if (!overlaps(box)) continue;
          for (const [bbox, color, ref, line] of lines) {
            if (overlaps(bbox))
              features.push(
                feature(
                  { type: "LineString", coordinates: decodeLine(line) },
                  { color: color || "#999fa3", ref },
                ),
              );
          }
          for (const [lon, lat, name] of stations)
            features.push(
              feature({ type: "Point", coordinates: [lon, lat] }, { name }),
            );
        }
      map.getSource("metro").setData(collection(features));
    } catch (error) {
      console.warn("Metro network unavailable", error.message);
    }
  }
  function reset() {
    map.flyTo({
      center: state.scope === "china" ? [104, 35] : [105, 25],
      zoom: state.scope === "china" ? 2.5 : 1.5,
      pitch: 0,
      bearing: 0,
      duration: reduced() ? 0 : 1100,
    });
  }
  function focus(id, { street = false } = {}) {
    const p = byId.get(id);
    if (!p) return;
    state.selected = id;
    render();
    const g = fine.get(id) || coarse.get(id);
    const padding = {
      top: 145,
      bottom: root.clientHeight > 600 ? 260 : 70,
      left: 35,
      right: 35,
    };
    let target = {
      center: [+p.lon, +p.lat],
      zoom: street ? 15 : p.type === "sight" ? 13 : 10,
    };
    if (g && !street) {
      const b = boundsOf(g);
      if (b[2] - b[0] < 300) {
        const camera = map.cameraForBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding, maxZoom: p.type === "country" ? 5 : 11 },
        );
        if (camera) target = camera;
      }
    }
    map.flyTo({
      ...target,
      padding,
      duration: reduced() ? 0 : 1450,
      curve: 1.45,
      pitch: 0,
      bearing: 0,
      essential: false,
    });
  }
  map.on("load", () => {
    loaded = true;
    const flagCanvas = document.createElement("canvas");
    flagCanvas.width = 64;
    flagCanvas.height = 48;
    const flagContext = flagCanvas.getContext("2d");
    flagContext.font = "40px system-ui";
    flagContext.textAlign = "center";
    flagContext.textBaseline = "middle";
    for (const p of places.filter(
      (p) => p.type === "country" && /^[A-Z]{2}$/.test(p.countryCode),
    )) {
      const id = "flag-" + p.countryCode;
      if (map.hasImage(id)) continue;
      flagContext.clearRect(0, 0, 64, 48);
      flagContext.fillText(
        String.fromCodePoint(
          ...[...p.countryCode].map((c) => 127397 + c.charCodeAt(0)),
        ),
        32,
        25,
      );
      map.addImage(id, flagContext.getImageData(0, 0, 64, 48), {
        pixelRatio: 2,
      });
    }
    render();
    refine();
    metros();
  });
  map.on("moveend", () => {
    render();
    refine();
    metros();
  });
  map.on("click", (e) => {
    const hits = map.queryRenderedFeatures(e.point, {
      layers: ["destination-dots", "destination-names", "area-hit"],
    });
    if (hits.length) {
      const id = hits[0].properties.id;
      onSelect?.(id);
    }
  });
  map.on("mousemove", (e) => {
    map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, {
      layers: ["destination-dots", "area-hit"],
    }).length
      ? "pointer"
      : "";
  });
  const instance = {
    update(next) {
      const changed = next.scope && next.scope !== state.scope;
      state = { ...state, ...next };
      render();
      if (changed) reset();
      refine();
      metros();
    },
    focus,
    reset,
    zoom(k) {
      map.zoomTo(map.getZoom() + Math.log2(k), { duration: 300 });
    },
    destroy() {
      disposed = true;
      observer.disconnect();
      map.remove();
    },
  };
  instances.set(root, instance);
  return instance;
}
window.TravelMap = { mount };
