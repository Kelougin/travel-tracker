"""Validated, atomic local destination storage."""
import json
import os
import re
import tempfile
from math import cos, hypot, isfinite, radians
from pathlib import Path
from uuid import uuid4

CATEGORIES = {
    "want": ("Want to visit", "#2571bd"),
    "unvisited": ("Not visited", "#a16b10"),
    "again": ("Visited · would go again", "#187957"),
    "once": ("Visited · once is enough", "#a64c70"),
}


def coordinate(value, limit):
    if type(value) not in (int, float) or not isfinite(value) or abs(value) > limit:
        raise ValueError("Coordinates are outside the valid range.")
    return value


def destination(data):
    if not isinstance(data, dict):
        raise ValueError("Invalid destination record.")
    name, location, category = (data.get(k) for k in ("name", "location", "category"))
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Enter a destination name.")
    if not isinstance(location, str) or not isinstance(category, str) or category not in CATEGORIES:
        raise ValueError("Invalid location or visit status.")
    extra = {}
    for field in ("city", "country", "notes", "cost", "currency", "place_type", "osm_key"):
        value = data.get(field, "")
        if not isinstance(value, str):
            raise ValueError(f"Invalid {field}.")
        extra[field] = value.strip()
    if extra["cost"] and not re.fullmatch(r"[0-9]{1,12}(?:\.[0-9]{1,2})?", extra["cost"]):
        raise ValueError("Enter a positive amount or zero, with up to two decimal places.")
    extra["currency"] = extra["currency"].upper() or "CAD"
    if not re.fullmatch(r"[A-Z]{3}", extra["currency"]):
        raise ValueError("Enter a three-letter currency code, such as CAD or JPY.")
    extra["place_type"] = extra["place_type"] or "Other"
    return dict(**extra, name=name.strip(), location=location.strip(), category=category,
                lat=coordinate(data.get("lat"), 90), lon=coordinate(data.get("lon"), 180))


def same_place(a, b):
    if a["osm_key"] and b["osm_key"]:
        return a["osm_key"] == b["osm_key"]
    def normalized_name(place):
        return " ".join(place["name"].casefold().split())
    if normalized_name(a) != normalized_name(b):
        return False
    # Local-distance approximation in metres, including across the date line.
    delta_lon = (a["lon"] - b["lon"] + 180) % 360 - 180
    east = delta_lon * cos(radians((a["lat"] + b["lat"]) / 2))
    return hypot(a["lat"] - b["lat"], east) * 111_195 <= 30


class Store:
    def __init__(self, path: Path):
        self.path = path
        self.places = {}
        if path.exists():
            saved = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(saved, dict) or saved.get("version") != 1 or not isinstance(saved.get("places"), list):
                raise ValueError("Unrecognized destination file format.")
            for row in saved["places"]:
                item = destination(row)
                key = row.get("id")
                if not isinstance(key, str) or not key or key in self.places:
                    raise ValueError("Invalid or duplicate destination ID.")
                self.places[key] = dict(item, id=key)

    def save(self, data, key=None):
        item = destination(data)
        if key is not None and key not in self.places:
            raise ValueError("This destination no longer exists.")
        original = self.places.get(key)
        for other_key, other in self.places.items():
            if key != other_key and same_place(item, other):
                if original and same_place(original, other):
                    continue  # Keep pre-existing duplicates editable.
                raise ValueError(f'Already saved as “{other["name"]}”. Edit the existing destination.')
        key = key or str(uuid4())
        updated = dict(self.places)
        updated[key] = dict(item, id=key)
        self._commit(updated)

    def remove(self, key):
        if key not in self.places:
            raise ValueError("This destination no longer exists.")
        updated = dict(self.places)
        del updated[key]
        self._commit(updated)

    def _commit(self, updated):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=self.path.parent, delete=False) as tmp:
            temp_path = Path(tmp.name)
        try:
            content = {"version": 1, "places": list(updated.values())}
            temp_path.write_text(json.dumps(content, indent=2, ensure_ascii=False), encoding="utf-8")
            os.replace(temp_path, self.path)
        finally:
            temp_path.unlink(missing_ok=True)
        self.places = updated
