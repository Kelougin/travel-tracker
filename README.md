# Project Information and Questions

Project Name: Travel Track/Trip Planner

Description: The application allows users to track place they have visited or want to visit and then plan trips using those locations. It main audience would be people who like to travel a lot or plan to go on trip.

Purpose: I mainly built it for myself because I like to save locations around the world that maybe one day I could get to visit and I've wanted to make something like this for a little so I thought this would be a good to time to just. Kill two birds with one stone kind of thing. That's why I choose to build this. I'm also planning trip to Japan in 2028 which you can see by my AI saying Japan related things because I've used it to help me brainstorm and keep track of ideas.

Features: Categorize places you want to visit or have visited by placing different color pins on the map or by searching a location. You can then create a trip and add place you want to go in that or maybe you have a place you want to visit again you can add that too.

Technologies: Main Language: Python, PySide6: Creates desktop window, forms and menus, Leaflet.js for interactive map and pins, OpenStreetMap for map image, Json to save destination locally and PyInstaller to run application through executable 

AI Tool Used: ChatGPT ASTRA 6.2 Codex

How AI Was Used:

Screenshots:

Future Improvements:
# Travel Tracker

Keep a personal travel map on your desktop. Search for a city, street address, or attraction, or zoom in and click the exact point you want to remember. Your journal stays in a local JSON file.

| Marker | Visit status |
| --- | --- |
| Blue | Want to visit |
| Amber | Not visited |
| Green | Visited · would go again |
| Rose | Visited · once is enough |

## Run on Windows

Install 64-bit Python 3.12. Extract the project ZIP and open PowerShell in the folder containing `main.py`. If you have a Git remote, you can also get a working copy with `git clone https://github.com/Kelougin/travel-tracker.git` and `cd travel-tracker`.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe main.py
```

For later launches, run the last command. Calling the environment's interpreter directly also works when PowerShell script activation is disabled.

## Run on macOS or Linux

Use Python 3.12 and a graphical desktop. On Linux, your distribution must provide the native Qt graphics libraries (including EGL/OpenGL, X11/XCB or Wayland, and NSS).

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python main.py
```

## Use the map and journal

- Scroll or use the zoom buttons to reach street level. A single click opens a destination form at that coordinate. Enter a name, choose a status, and save.
- Enter a place such as **Hakodate Morning Market, Japan** and press Enter. Choose a result to review its address and coordinates before saving. Adding a city or country helps distinguish places with similar names.
- In **Destinations**, each entry shows its status, saved address when provided, and latitude/longitude. **Show on map** centers the pin. **Edit** can change the name, address, coordinates, and status. Clicking a marker also opens its editor.
- Use the status filter to narrow both the list and the map. **Delete** asks for confirmation before removing a place.

## Develop and package

Use the project-local `.venv` created above. In your editor, select its Python interpreter. Install the development requirements to add PyInstaller. Run the following from the project root on the OS you want to build for.

| Task | Windows PowerShell | macOS / Linux |
| --- | --- | --- |
| Install development dependencies | `.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt` | `.venv/bin/python -m pip install -r requirements-dev.txt` |
| Launch from source | `.\.venv\Scripts\python.exe main.py` | `.venv/bin/python main.py` |
| Build desktop distribution | `.\.venv\Scripts\python.exe -m PyInstaller --noconfirm TravelTracker.spec` | `.venv/bin/python -m PyInstaller --noconfirm TravelTracker.spec` |

Open `dist/TravelTracker/TravelTracker.exe` on Windows or `dist/TravelTracker/TravelTracker` on Linux/macOS. Distribute the **entire TravelTracker folder** so the executable can find Qt WebEngine and the map files. Virtual environments and build output are excluded from Git.

| Project file | Purpose |
| --- | --- |
| `main.py` | PySide6 desktop window, Qt WebChannel bridge, asynchronous geocoding |
| `storage.py` | Destination validation, stable IDs, and atomic JSON replacement |
| `assets/index.html`, `style.css`, `journal.js` | Map, destination list, editor, and search interface |
| `assets/leaflet/` | Bundled Leaflet 1.9.4 and its license |
| `TravelTracker.spec` | PyInstaller configuration and asset collection |

To check a development build, create a map pin, change its status, restart, and find it using the status filter. Search for an attraction, save the result, and confirm that its address appears in the list. Delete the test entries when finished.

## Local data and map services

The journal is saved after each change as `destinations.json` in Qt's application-local data directory. Typical locations are `%LOCALAPPDATA%\TravelTracker` on Windows, `~/Library/Application Support/TravelTracker` on macOS, and `~/.local/share/TravelTracker` on Linux. To back up or migrate the journal, close the application and copy this file. An unreadable journal is preserved and reported at startup.

OpenStreetMap supplies map tiles. Explicit searches send the entered query to Nominatim. Both services need internet access. Saved destinations can still be viewed and edited offline. The app requests results only on submission, spaces network searches at least one second apart, and reuses identical results during a session. A compatible search endpoint can be configured with the `TRAVEL_SEARCH_URL` environment variable before launch.

[OpenStreetMap attribution](https://www.openstreetmap.org/copyright) · [Tile usage](https://operations.osmfoundation.org/policies/tiles/) · [Nominatim usage](https://operations.osmfoundation.org/policies/nominatim/)

## Destination details and map controls

- Open **Details and notes** on a destination to see its type, city, country, address, visit status, estimated cost and notes. Choose **Edit** to change them. Cost is optional and has its own currency code (initially CAD). Choose a suggested type such as Restaurant or Landmark, or enter your own.
- Select **Move pin**, drag the highlighted marker, then choose **Review** and **Save destination**. Canceling at either stage keeps the original coordinates. The address and place information remain editable when reviewing the new position.
- Country, city and visit-status filters apply to both pins and the list. Search results fill in geographic fields when available. You can enter them for map clicks and older records. The city menu follows the selected country.
- The journal checks for duplicates when saving. Matching OpenStreetMap object IDs identify repeat searches, including renamed entries. When an ID is missing, the app checks for the same name within 30 metres, ignoring letter case and repeated spaces.
- Search requests English names. The map uses OpenFreeMap’s full-color Bright vector style with English names where available, then Latin-script or local names. If the vector map cannot initialize or WebGL is unavailable, the standard OpenStreetMap raster layer supplies its original labels. Leaflet remains responsible for map interactions and pins.

## Trip collections

Select **New trip**, name it, and check any destinations already in your journal. Click a trip to show its pins and destination list. The map zooms to the trip, and you can narrow the selection further by status, country, or city. **All destinations** returns to the full journal.

New pins start with the active trip selected. The destination editor lets you assign a place to several trips. **Edit trip** lets you rename a trip, add or remove places, or delete the collection. Removing a place from a trip or deleting the trip keeps the destination in your journal.

The app reads earlier journals automatically. The next save writes the trip-aware JSON format in the same location.
