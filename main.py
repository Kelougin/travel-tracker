"""Travel Tracker desktop entry point."""
import json
import os
import sys
from pathlib import Path
from time import monotonic

from PySide6.QtCore import QObject, QLockFile, QStandardPaths, QUrl, QUrlQuery, Signal, Slot
from PySide6.QtGui import QDesktopServices
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkReply, QNetworkRequest
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QMessageBox

from storage import CATEGORIES, Store, coordinate

AGENT = "TravelTrackerDesktop/1.0 (personal travel journal)"
SEARCH_URL = os.environ.get("TRAVEL_SEARCH_URL", "https://nominatim.openstreetmap.org/search")


class Page(QWebEnginePage):
    def acceptNavigationRequest(self, url, kind, main_frame):
        if main_frame and url.scheme() == "https":
            if kind == self.NavigationType.NavigationTypeLinkClicked:
                QDesktopServices.openUrl(url)
            return False
        return super().acceptNavigationRequest(url, kind, main_frame)


class Backend(QObject):
    results = Signal(str)

    def __init__(self, store, parent):
        super().__init__(parent)
        self.store = store
        self.network = QNetworkAccessManager(self)
        self.pending = None
        self.last_query = float("-inf")
        self.cache = {}

    @Slot(result=str)
    def state(self):
        return json.dumps({"places": list(self.store.places.values()), "categories": CATEGORIES, "trips": list(self.store.trips.values())})

    @Slot(str, result=str)
    def save(self, raw):
        try:
            data = json.loads(raw)
            self.store.save(data, data.get("id"))
        except (OSError, ValueError, TypeError) as error:
            return str(error)
        return ""

    @Slot(str, result=str)
    def remove(self, key):
        try:
            self.store.remove(key)
        except (OSError, ValueError) as error:
            return str(error)
        return ""

    @Slot(str, result=str)
    def saveTrip(self, raw):
        try:
            key = self.store.save_trip(json.loads(raw))
            return json.dumps({"id": key})
        except (OSError, ValueError, TypeError) as error:
            return json.dumps({"error": str(error)})

    @Slot(str, result=str)
    def removeTrip(self, key):
        try:
            self.store.remove_trip(key)
        except (OSError, ValueError) as error:
            return str(error)
        return ""

    @Slot(str)
    def search(self, query):
        query = query.strip()
        key = query.casefold()
        if key in self.cache:
            self.results.emit(self.cache[key])
            return
        if not query or self.pending or monotonic() - self.last_query < 1:
            self.results.emit(json.dumps({"error": "Please wait a moment before searching again."}))
            return
        url = QUrl(SEARCH_URL)
        params = QUrlQuery()
        for name, value in (("q", query), ("format", "jsonv2"), ("limit", "6"), ("addressdetails", "1"), ("accept-language", "en")):
            params.addQueryItem(name, value)
        url.setQuery(params)
        request = QNetworkRequest(url)
        request.setTransferTimeout(15000)
        request.setRawHeader(b"User-Agent", AGENT.encode())
        self.last_query = monotonic()
        reply = self.network.get(request)
        self.pending = reply
        reply.finished.connect(lambda: self.finish_search(reply, key))

    def finish_search(self, reply, key):
        self.pending = None
        try:
            if reply.error() != QNetworkReply.NetworkError.NoError:
                raise ValueError("Search unavailable. Check your connection and try again.")
            rows = json.loads(bytes(reply.readAll()))
            if not isinstance(rows, list):
                raise ValueError("Unexpected search response.")
            matches = []
            for row in rows:
                label = row["display_name"]
                address = row.get("address", {})
                city = next((address[k] for k in ("city", "town", "village", "municipality", "hamlet")
                             if address.get(k)), "")
                osm_key = f"{row['osm_type']}/{row['osm_id']}" if row.get("osm_type") and row.get("osm_id") else ""
                matches.append(dict(city=city, country=address.get("country", ""), osm_key=osm_key,
                                    name=label.split(",")[0], location=label,
                                    lat=coordinate(float(row["lat"]), 90),
                                    lon=coordinate(float(row["lon"]), 180)))
            payload = json.dumps({"matches": matches})
            self.cache[key] = payload
        except (KeyError, TypeError, AttributeError, ValueError) as error:
            payload = json.dumps({"error": str(error)})
        reply.deleteLater()
        self.results.emit(payload)


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("TravelTracker")
    folder = Path(QStandardPaths.writableLocation(QStandardPaths.StandardLocation.AppLocalDataLocation))
    try:
        folder.mkdir(parents=True, exist_ok=True)
        lock = QLockFile(str(folder / "session.lock"))
        lock.setStaleLockTime(0)
        if not lock.tryLock(0):
            raise ValueError("Cannot lock the journal. Close any other Travel Tracker window and retry.")
        store = Store(folder / "destinations.json")
    except (OSError, ValueError) as error:
        QMessageBox.critical(None, "Cannot open travel journal", f"{folder}\n\n{error}")
        return 1

    view = QWebEngineView()
    profile = QWebEngineProfile("map", view)
    page = Page(profile, view)
    view.setPage(page)
    profile.setHttpUserAgent(profile.httpUserAgent() + " " + AGENT)
    page.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
    page.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
    channel = QWebChannel(page)
    backend = Backend(store, channel)
    channel.registerObject("journal", backend)
    page.setWebChannel(channel)
    view.setWindowTitle("Travel Tracker")
    view.resize(1220, 790)
    view.setMinimumSize(740, 510)
    view.load(QUrl.fromLocalFile(str(Path(__file__).resolve().parent / "assets" / "index.html")))
    view.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
