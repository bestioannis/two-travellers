"""Build lazy map paths from the same source snapshots used to create atlas.json.

Run with pyshp installed: python datasets/build_detail.py /path/to/source/files /path/to/app
Input names and download locations are documented in SOURCES.md.
"""

import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

import shapefile


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def coord(number):
    # Sub-metre quantization at the equator. Never remove interior vertices.
    return f"{number:.6f}".rstrip("0").rstrip(".") or "0"


def shapefile_rings(shape):
    offsets = list(shape.parts) + [len(shape.points)]
    return [shape.points[start:end] for start, end in zip(offsets, offsets[1:])]


def geojson_rings(geometry):
    polygons = geometry["coordinates"]
    if geometry["type"] == "Polygon":
        polygons = [polygons]
    return [ring for polygon in polygons for ring in polygon]


def geometry_info(rings):
    paths = []
    boxes = []
    for ring in rings:
        if len(ring) < 3:
            continue
        points = ring[:-1] if ring[-1] == ring[0] else ring
        xs, ys = zip(*points)
        boxes.append((min(xs), min(ys), max(xs), max(ys)))
        vertices = [f"{coord(180 + x)},{coord(90 - y)}" for x, y in points]
        paths.append("M" + "L".join(vertices) + "Z")
    if not paths:
        raise ValueError("Feature has no polygon rings")
    bbox = union_bounds(boxes)
    # Disconnected island groups can span oceans. Use several small bounds
    # to avoid retrieving the entire country in a view of unoccupied water.
    groups = defaultdict(list)
    for box in boxes:
        center = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
        groups[tuple(math.floor(v / 8) for v in center)].append(box)
    local_boxes = [union_bounds(group) for group in groups.values()]
    return "".join(paths), bbox, local_boxes


def union_bounds(boxes):
    return [
        math.floor(min(box[0] for box in boxes) * 1e5) / 1e5,
        math.floor(min(box[1] for box in boxes) * 1e5) / 1e5,
        math.ceil(max(box[2] for box in boxes) * 1e5) / 1e5,
        math.ceil(max(box[3] for box in boxes) * 1e5) / 1e5,
    ]


class Export:
    def __init__(self, destination):
        self.root = destination
        self.folder = self.root / "detail"
        self.folder.mkdir(exist_ok=True)
        self.index = dict(version=1, world=[], regions=[], prefectures=[], labels=[])
        self.features = defaultdict(list)

    def feature(self, layer, feature_id, country_code, rings, anchor):
        path, bbox, islands = geometry_info(rings)
        item = dict(id=feature_id, bbox=bbox, countryCode=country_code)
        if len(islands) > 1:
            item["boxes"] = islands
        self.index[layer].append(item)
        self.features[layer].append((anchor, item, path))

    def write(self):
        # Spatial ordering keeps the number of GitHub Pages files small without
        # requiring visitors in one region to download the entire map.
        limit = 1_750_000
        previous = set()
        index_path = self.folder / "index.json"
        if index_path.exists():
            index = json.loads(index_path.read_text())
            previous = {entry["file"] for layer in self.features for entry in index[layer]}
        current = set()
        for layer, features in self.features.items():
            pending = {}
            size = 0
            sequence = 0
            for _, item, path in sorted(features, key=lambda row: spatial_order(*row[0])):
                if pending and size + len(path) > limit:
                    (self.root / filename).write_text(compact(pending))
                    pending = {}
                    size = 0
                    sequence += 1
                filename = f"detail/{layer[0]}-{sequence:02}.json"
                current.add(filename)
                item["file"] = filename
                pending[item["id"]] = path
                size += len(path)
            (self.root / filename).write_text(compact(pending))
        index_path.write_text(compact(self.index))
        for stale in previous - current:
            if re.fullmatch(r"detail/[wrp][-0-9_]+\.json", stale):
                (self.root / stale).unlink(missing_ok=True)
        return len(current)


def spatial_order(lon, lat):
    # Hilbert distance on a normalized 12-bit grid.
    side = 4096
    x = max(0, min(side - 1, int((lon + 180) / 360 * side)))
    y = max(0, min(side - 1, int((lat + 90) / 180 * side)))
    distance = 0
    half = side // 2
    while half:
        rx = int(bool(x & half))
        ry = int(bool(y & half))
        distance += half * half * ((3 * rx) ^ ry)
        if not ry:
            if rx:
                x, y = half - 1 - x, half - 1 - y
            x, y = y, x
        half //= 2
    return distance


def read_json(path):
    return json.loads(path.read_text())


def load_shapes(root, layer):
    return shapefile.Reader(str(root / (layer + ".zip")))


def choose_code(props):
    if props["ADM0_A3"] in {"CHN", "HKG", "MAC", "TWN"}:
        return "CN"
    for field in ("ISO_A2", "ISO_A2_EH"):
        if re.fullmatch("[A-Z]{2}", props[field] or ""):
            return props[field]
    # Expose the unassigned Natural Earth feature without inventing an ISO flag.
    return "X-" + props["ADM0_A3"]


def main(source, destination):
    records = read_json(destination / "atlas.json")
    atlas = {item["id"]: item for item in records}
    export = Export(destination)
    country_codes = {}
    labels = {}
    for i, feature in enumerate(load_shapes(source, "admin_0_countries").iterShapeRecords()):
        props = feature.record.as_dict()
        code = choose_code(props)
        country_codes[props["ADM0_A3"]] = code
        center = (props["LABEL_X"], props["LABEL_Y"])
        label = dict(id=code, name="中国" if code == "CN" else (props["NAME_ZH"] or props["NAME"]),
                     lon=center[0], lat=center[1], rank=props["LABELRANK"])
        # Prefer the country proper over dependencies sharing its code.
        if code not in labels or props["ADM0_A3"] == "CHN" or (
            props["ISO_A2"] == code and props["ADM0_A3"] not in {"HKG", "MAC", "TWN"}
        ):
            labels[code] = label
        export.feature("world", str(i), code, shapefile_rings(feature.shape), center)
    export.index["labels"] = sorted(labels.values(), key=lambda v: (v["rank"], v["name"]))

    def source_code(adm0, iso2):
        return country_codes.get(adm0) or (iso2 if re.fullmatch("[A-Z]{2}", iso2 or "") else "X-" + adm0)

    for feature in load_shapes(source, "admin_1_states_provinces").iterShapeRecords():
        props = feature.record.as_dict()
        feature_id = "reg-" + str(props["ne_id"])
        if feature_id not in atlas:
            continue
        item = atlas[feature_id]
        code = source_code(props["adm0_a3"], props["iso_a2"])
        item["countryCode"] = code
        export.feature("regions", feature_id, code, shapefile_rings(feature.shape),
                       (item["lon"], item["lat"]))
    for row in load_shapes(source, "populated_places").iterRecords():
        props = row.as_dict()
        feature_id = "city-" + str(props["NE_ID"])
        if feature_id in atlas:
            item = atlas[feature_id]
            item["countryCode"] = "CN" if item["country"] == "中国" else source_code(props["ADM0_A3"], props["ISO_A2"])
    fallback = {}
    for path in [source / "china.json", *sorted(source.glob("cn-*.json"))]:
        for feature in read_json(path)["features"]:
            code = str(feature["properties"].get("adcode", ""))
            if code.isdecimal():
                fallback[code] = feature
    municipality = {name + "0100": name + "0000" for name in ("11", "12", "31", "50")}
    for item in records:
        if item["country"] == "中国":
            item["countryCode"] = "CN"
        if not item["id"].startswith("cn-"):
            continue
        code = item["id"][3:]
        source_code_cn = municipality.get(code, code)
        detailed = source / "cn-detail" / (source_code_cn + ".json")
        feature = fallback[source_code_cn]
        if detailed.is_file():
            single = read_json(detailed)["features"][0]
            options = (feature, single)
            feature = max(options, key=lambda f: sum(len(r) for r in geojson_rings(f["geometry"])))
        if str(feature["properties"]["adcode"]) != source_code_cn:
            raise ValueError(f"Unexpected DataV administrative code in {detailed}")
        layer = "regions" if item["type"] == "region" else "prefectures"
        export.feature(layer, item["id"], "CN", geojson_rings(feature["geometry"]), (item["lon"], item["lat"]))
    assert all(x.get("countryCode") and (x["country"] != "中国" or x["countryCode"] == "CN") for x in records)
    assert len(export.index["world"]) == len(read_json(destination / "world.json"))
    for layer, category in (("regions", "region"), ("prefectures", "prefecture")):
        assert {x["id"] for x in export.index[layer]} == {x["id"] for x in records if x["type"] == category}
    count = export.write()
    (destination / "atlas.json").write_text(compact(records))
    print(f"{count} detailed geometry bundles, {len(records)} places, {len(labels)} country and area labels")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
