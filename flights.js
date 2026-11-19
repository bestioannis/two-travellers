let networkPromise;
const normalize = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ city$|市$/g, "")
    .replace(/[^a-z0-9\u3400-\u9fff]/g, "");
const radians = (value) => (value * Math.PI) / 180;
function distance(a, b) {
  const dlat = radians(b[1] - a[1]),
    dlon = radians(b[0] - a[0]);
  return (
    6371 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dlat / 2) ** 2 +
            Math.cos(radians(a[1])) *
              Math.cos(radians(b[1])) *
              Math.sin(dlon / 2) ** 2,
        ),
      ),
    )
  );
}
const overrides = {
  香港: ["HKG"],
  澳门: ["MFM"],
  深圳市: ["SZX"],
  广州市: ["CAN"],
  台北市: ["TPE", "TSA"],
  东京: ["HND", "NRT"],
  京都: ["ITM", "KIX"],
  大阪: ["ITM", "KIX"],
  纽约: ["JFK", "LGA", "EWR"],
  巴黎: ["CDG", "ORY", "BVA"],
  伦敦: ["LHR", "LGW", "STN", "LTN", "LCY", "SEN"],
  北京市: ["PEK", "PKX"],
  上海市: ["SHA", "PVG"],
};
function arc(from, to) {
  const vector = ([lon, lat]) => [
    Math.cos(radians(lat)) * Math.cos(radians(lon)),
    Math.cos(radians(lat)) * Math.sin(radians(lon)),
    Math.sin(radians(lat)),
  ];
  const a = vector(from),
    b = vector(to),
    angle = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          a.reduce((sum, v, i) => sum + v * b[i], 0),
        ),
      ),
    ),
    sin = Math.sin(angle),
    segments = [[]];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48,
      wa = sin > 1e-6 ? Math.sin((1 - t) * angle) / sin : 1 - t,
      wb = sin > 1e-6 ? Math.sin(t * angle) / sin : t,
      v = a.map((x, j) => x * wa + b[j] * wb);
    const p = [
      (Math.atan2(v[1], v[0]) * 180) / Math.PI,
      (Math.atan2(v[2], Math.hypot(v[0], v[1])) * 180) / Math.PI,
    ];
    let line = segments.at(-1),
      prev = line.at(-1);
    if (prev && Math.abs(p[0] - prev[0]) > 180) {
      const sign = prev[0] > 0 ? 1 : -1,
        other = p[0] + sign * 360,
        f = (sign * 180 - prev[0]) / (other - prev[0]),
        lat = prev[1] + f * (p[1] - prev[1]);
      line.push([sign * 180, lat]);
      line = [[-sign * 180, lat]];
      segments.push(line);
    }
    line.push(p);
  }
  return {
    type: "MultiLineString",
    coordinates: segments.filter((line) => line.length > 1),
  };
}
export async function routesForCity(place) {
  networkPromise ||= fetch("./flight-network.json")
    .then((r) => {
      if (!r.ok) throw Error("航线资料暂时无法载入");
      return r.json();
    })
    .catch((error) => {
      networkPromise = null;
      throw error;
    });
  const data = await networkPromise,
    airports = data.airports,
    origin = [+place.lon, +place.lat];
  let codes = (overrides[place.name] || []).filter((code) => airports[code]);
  const country = place.taiwan ? "TW" : place.countryCode;
  if (!codes.length) {
    const candidates = Object.entries(airports)
      .filter(([, a]) => a[2] === country)
      .map(([code, a]) => ({ code, a, km: distance(origin, [a[3], a[4]]) }))
      .filter((a) => a.km < 120)
      .sort((a, b) => a.km - b.km);
    const name = normalize(place.alias || place.name);
    const matched = candidates.filter(({ a }) => normalize(a[1]) === name);
    const seed = matched[0] || candidates[0];
    if (seed)
      codes = candidates
        .filter(
          (c) =>
            matched.includes(c) ||
            c.code === seed.code ||
            (seed.a[5] && c.a[5] === seed.a[5]) ||
            normalize(c.a[1]) === normalize(seed.a[1]),
        )
        .map((c) => c.code);
  }
  const from = new Set(codes),
    destinations = new Map(),
    features = [];
  for (const [a, b, period, source] of data.routes) {
    if (!from.has(a) && !from.has(b)) continue;
    const start = from.has(a) ? a : b,
      end = start === a ? b : a;
    if (from.has(end)) continue;
    const airport = airports[end],
      departure = airports[start];
    features.push({
      type: "Feature",
      properties: { from: start, to: end, period, source },
      geometry: arc([departure[3], departure[4]], [airport[3], airport[4]]),
    });
    if (!destinations.has(end))
      destinations.set(end, {
        code: end,
        name: airport[0],
        city: airport[1],
        country: airport[2],
        lon: airport[3],
        lat: airport[4],
        from: [],
      });
    destinations.get(end).from.push(start);
  }
  const rows = [...destinations.values()].sort((a, b) =>
    a.city.localeCompare(b.city),
  );
  return {
    generated: data.generated,
    codes,
    rows,
    routes: { type: "FeatureCollection", features },
    airports: {
      type: "FeatureCollection",
      features: rows.map((a) => ({
        type: "Feature",
        properties: { code: a.code, name: a.city },
        geometry: { type: "Point", coordinates: [a.lon, a.lat] },
      })),
    },
  };
}
