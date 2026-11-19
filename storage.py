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
        self.trips = {}
        if path.exists():
            saved = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(saved, dict) or saved.get("version") not in (1, 2) or not isinstance(saved.get("places"), list):
                raise ValueError("Unrecognized destination file format.")
            for row in saved["places"]:
                item = destination(row)
                key = row.get("id")
                if not isinstance(key, str) or not key or key in self.places:
                    raise ValueError("Invalid or duplicate destination ID.")
                self.places[key] = dict(item, id=key)

            rows = saved.get("trips", [])
            if not isinstance(rows, list):
                raise ValueError("Invalid trip collection.")
            for row in rows:
                if not isinstance(row, dict):
                    raise ValueError("Invalid trip record.")
                trip = self._trip(row)
                key = row.get("id")
                if not isinstance(key, str) or not key or key in self.trips:
                    raise ValueError("Invalid or duplicate trip ID.")
                self.trips[key] = dict(trip, id=key)

    def _trip(self, data):
        name = data.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Enter a trip name.")
        ids = data.get("places")
        if not isinstance(ids, list) or any(not isinstance(i, str) or i not in self.places for i in ids):
            raise ValueError("A destination in this trip no longer exists.")
        return dict(name=name.strip(), places=list(dict.fromkeys(ids)))

    def save_trip(self, data):
        trip = self._trip(data)
        key = data.get("id")
        if key is not None and key not in self.trips:
            raise ValueError("This trip no longer exists.")
        if any(t["name"].casefold() == trip["name"].casefold() and k != key for k, t in self.trips.items()):
            raise ValueError("A trip with this name already exists.")
        key = key or str(uuid4())
        trips = dict(self.trips)
        trips[key] = dict(trip, id=key)
        self._commit(self.places, trips)
        return key

    def remove_trip(self, key):
        if key not in self.trips:
            raise ValueError("This trip no longer exists.")
        self._commit(self.places, {k: t for k, t in self.trips.items() if k != key})

    def _memberships(self, key, selected):
        if not isinstance(selected, list) or any(not isinstance(i, str) or i not in self.trips for i in selected):
            raise ValueError("A selected trip no longer exists.")
        trips = dict(self.trips)
        for trip_id, trip in self.trips.items():
            members = trip["places"]
            if trip_id in selected and key not in members:
                trips[trip_id] = dict(trip, places=[*members, key])
            elif trip_id not in selected and key in members:
                trips[trip_id] = dict(trip, places=[i for i in members if i != key])
        return trips

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
        trips = self._memberships(key, data["trip_ids"]) if "trip_ids" in data else self.trips
        self._commit(updated, trips)

    def remove(self, key):
        if key not in self.places:
            raise ValueError("This destination no longer exists.")
        updated = dict(self.places)
        del updated[key]
        self._commit(updated, self._memberships(key, []))

    def _commit(self, updated, trips):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=self.path.parent, delete=False) as tmp:
            temp_path = Path(tmp.name)
        try:
            content = {"version": 2, "places": list(updated.values()), "trips": list(trips.values())}
            temp_path.write_text(json.dumps(content, indent=2, ensure_ascii=False), encoding="utf-8")
            os.replace(temp_path, self.path)
        finally:
            temp_path.unlink(missing_ok=True)
        self.places = updated
        self.trips = trips
