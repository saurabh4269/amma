"""Straight-line access to health facilities and cell towers in The Gambia.

Inputs (all from the data handover, see data/health-transfer/MANIFEST.csv):
  - WorldPop 2020 population grid for The Gambia (gmb_ppp_2020.tif)
  - the built place pack for The Gambia (Maina facility list plus healthsites points)
  - OpenCelliD towers filtered to the Gambian country code 607

Output: research/reports/gambia-access.json, and a table on stdout.

Distances are straight lines. They are not travel times: the River Gambia, roads and
seasons are ignored, so real journeys are longer. OpenCelliD is crowd-sourced, so a
missing tower does not prove there is no signal.

Run: uv run --with rasterio --with numpy --with scipy python research/access/gambia_access.py
"""
import csv, gzip, json, math, sys
from pathlib import Path

import numpy as np
import rasterio
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "health-transfer"
PLACES = ROOT / "apps" / "web" / "public" / "packs" / "places.json"
OUT = ROOT / "research" / "reports" / "gambia-access.json"
GAMBIA_MCC = "607"
KM_PER_DEG_LAT = 111.32


def to_km(lon, lat, lat0):
    """Local flat projection: good to well under 1% across a country this small."""
    return np.column_stack([np.asarray(lon) * KM_PER_DEG_LAT * math.cos(math.radians(lat0)), np.asarray(lat) * KM_PER_DEG_LAT])


def weighted_median(values, weights):
    order = np.argsort(values)
    cum = np.cumsum(weights[order])
    return float(values[order][np.searchsorted(cum, cum[-1] / 2)])


def main():
    with rasterio.open(DATA / "datasets" / "WorldPop" / "gmb_ppp_2020.tif") as src:
        pop = src.read(1)
        nodata = src.nodata
        rows, cols = np.nonzero((pop != nodata) & (pop > 0))
        xs, ys = rasterio.transform.xy(src.transform, rows, cols)
        people = pop[rows, cols].astype(np.float64)
    lat0 = float(np.mean(ys))
    cells = to_km(xs, ys, lat0)
    total = float(people.sum())

    pack = next(p for p in json.loads(PLACES.read_text()) if p["id"] == "gm")
    typed = {s["id"] for s in pack["sources"] if s["typedLevels"]}
    fac = pack["facilities"]
    groups = {
        "any facility (official list or public map)": fac,
        "any facility on the official list": [f for f in fac if f["source"] in typed],
        "hospital on the official list": [f for f in fac if f["source"] in typed and f["level"] == "hospital"],
    }

    towers = []
    with gzip.open(DATA / "derived" / "cell_towers_mcc_607_608_612_540_404_405.csv.gz", "rt") as fh:
        for r in csv.DictReader(fh):
            if r["mcc"] == GAMBIA_MCC:
                towers.append((float(r["lon"]), float(r["lat"]), r["radio"]))

    result = {"population_2020": round(total), "populated_cells": int(len(people)), "facilities": {}, "towers": {}}

    def share_within(points_lonlat, thresholds):
        tree = cKDTree(to_km([p[0] for p in points_lonlat], [p[1] for p in points_lonlat], lat0))
        d, _ = tree.query(cells)
        out = {f"within_{t}_km": round(float(people[d <= t].sum() / total), 4) for t in thresholds}
        out["median_km"] = round(weighted_median(d, people), 2)
        out["p90_km"] = round(float(d[np.argsort(d)][np.searchsorted(np.cumsum(people[np.argsort(d)]), 0.9 * total)]), 2)
        return out

    for name, fs in groups.items():
        result["facilities"][name] = {"count": len(fs), **share_within([(f["lon"], f["lat"]) for f in fs], [2, 5, 10, 25, 50])}
    result["towers"]["all radios"] = {"count": len(towers), **share_within(towers, [2, 5, 10])}
    by_radio = {}
    for t in towers:
        by_radio[t[2]] = by_radio.get(t[2], 0) + 1
    result["towers"]["count_by_radio"] = by_radio

    OUT.write_text(json.dumps(result, indent=2))
    json.dump(result, sys.stdout, indent=2)


if __name__ == "__main__":
    main()
