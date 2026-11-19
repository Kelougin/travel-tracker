"use strict";
const el = id => document.getElementById(id);
const map = L.map("map", {worldCopyJump:true, minZoom:2, maxZoom:20}).setView([27, 12], 2);
const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxNativeZoom:19, maxZoom:20,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
}).addTo(map);
tiles.on("tileerror", () => { el("tileError").hidden = false; });
tiles.on("tileload", () => { el("tileError").hidden = true; });
useEnglishBasemap(map, tiles);
L.control.scale({imperial:false}).addTo(map);
const pins = L.layerGroup().addTo(map);
let journal, places = [], categories = {}, editing = null, deleting = null;

function node(tag, text, cls) {
    const item = document.createElement(tag);
    item.textContent = text;
    if (cls) item.className = cls;
    return item;
}
function action(title, handler, cls) {
    const button = node("button", title, cls);
    button.onclick = handler;
    return button;
}
let trips = [], activeTrip = null, editingTrip = null;
function choices(id, options, selected) {
    const box = el(id);
    box.replaceChildren();
    for (const option of options) {
        const label = node("label", "");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = option.id;
        input.checked = selected.includes(option.id);
        label.append(input, node("span", option.label || option.name));
        box.append(label);
    }
}
function checkedIds(id) {
    return Array.from(el(id).querySelectorAll("input:checked"), input => input.value);
}
function selectTrip(id) {
    activeTrip = id;
    for (const filter of ["filter", "countryFilter", "cityFilter"]) el(filter).value = "";
    render();
    const markers = pins.getLayers();
    if (markers.length) map.fitBounds(markers.map(marker => marker.getLatLng()), {padding:[35,35],maxZoom:16});
}
function renderTrips() {
    const nav = el("tripList");
    nav.replaceChildren();
    const add = (name, id, count) => {
        const button = action(name, () => selectTrip(id), "trip-link");
        button.append(node("span", String(count), "trip-count"));
        button.setAttribute("aria-pressed", String(activeTrip === id));
        nav.append(button);
    };
    add("All destinations", null, places.length);
    for (const trip of trips) add(trip.name, trip.id, trip.places.length);
    el("editTrip").hidden = !activeTrip;
}
function openTrip(trip) {
    editingTrip = trip?.id || null;
    el("tripTitle").textContent = trip ? "Edit trip" : "New trip";
    el("tripName").value = trip?.name || "";
    el("tripError").textContent = "";
    const options = places.map(p => ({id:p.id, label:[p.name,p.city,p.country].filter(Boolean).join(" · ")}));
    choices("tripPlaces", options, trip?.places || []);
    if (!places.length) el("tripPlaces").textContent = "Save destinations to this trip as you add them to the map.";
    el("deleteTrip").hidden = !trip;
    el("tripEditor").showModal();
    el("tripName").focus();
}
el("newTrip").onclick = () => openTrip(null);
el("editTrip").onclick = () => openTrip(trips.find(t => t.id === activeTrip));
el("cancelTrip").onclick = () => el("tripEditor").close();
el("tripForm").onsubmit = event => {
    event.preventDefault();
    const data = {id:editingTrip, name:el("tripName").value, places:checkedIds("tripPlaces")};
    el("saveTrip").disabled = true;
    journal.saveTrip(JSON.stringify(data), raw => {
        el("saveTrip").disabled = false;
        const result = JSON.parse(raw);
        if (result.error) { el("tripError").textContent = result.error; return; }
        el("tripEditor").close();
        refresh(false, () => selectTrip(result.id));
    });
};
el("deleteTrip").onclick = () => {
    el("tripDeleteText").textContent = 'Remove “' + trips.find(t => t.id === editingTrip).name + '” from your trips? Its destinations will stay in your journal.';
    el("tripDeleteError").textContent = "";
    el("tripDeleteDialog").showModal();
};
el("keepTrip").onclick = () => el("tripDeleteDialog").close();
el("confirmTripDelete").onclick = () => {
    journal.removeTrip(editingTrip, error => {
        if (error) { el("tripDeleteError").textContent = error; return; }
        el("tripDeleteDialog").close();
        el("tripEditor").close();
        refresh(false, () => selectTrip(null));
    });
};
function badge(key) {
    const [label, color] = categories[key];
    const result = node("span", label, "status");
    const dot = node("i", "", "dot");
    dot.style.backgroundColor = color;
    result.prepend(dot);
    return result;
}
function focusPlace(p) { map.setView([p.lat,p.lon], 17); }
const detailFields = ["country", "city", "place_type", "cost", "currency", "notes"];
let sourceKey = "";
let moving = null;
function edit(p) {
    finishMove();
    sourceKey = p.osm_key || "";
    for (const key of detailFields) el(key).value = p[key] || "";
    el("currency").value ||= "CAD";
    el("place_type").value ||= "Other";
    editing = p.id || null;
    const assigned = editing ? trips.filter(t => t.places.includes(editing)).map(t => t.id) : [activeTrip];
    choices("memberships", trips, assigned);
    el("membershipsBox").hidden = !trips.length;
    el("editTitle").textContent = editing ? "Edit destination" : "New destination";
    el("placeName").value = p.name || "";
    el("location").value = p.location || "";
    el("lat").value = p.lat;
    el("lon").value = p.lon;
    el("category").value = p.category || "want";
    el("editError").textContent = "";
    el("editor").showModal();
    el("placeName").focus();
}
function finishMove() {
    if (!moving) return;
    moving.marker.dragging.disable();
    moving.marker.setLatLng([moving.place.lat, moving.place.lon]);
    moving.marker.getElement()?.classList.remove("moving");
    el("moveBar").hidden = true;
    moving = null;
}
function startMove(place, marker) {
    finishMove();
    focusPlace(place);
    moving = {place, marker};
    marker.getElement().classList.add("moving");
    marker.dragging.enable();
    el("moveBar").hidden = false;
}
el("cancelMove").onclick = finishMove;
el("reviewMove").onclick = () => {
    if (!moving) return;
    const point = moving.marker.getLatLng().wrap();
    edit({...moving.place, lat:+point.lat.toFixed(7), lon:+point.lng.toFixed(7)});
};
function geographicOptions(id, field, rows, title) {
    const control = el(id);
    const previous = control.value;
    const options = new Map();
    for (const p of rows) {
        if (p[field]) options.set(p[field].toLowerCase(), p[field]);
    }
    control.replaceChildren(new Option(title, ""));
    for (const [value, label] of [...options].sort((a,b) => a[1].localeCompare(b[1]))) {
        control.add(new Option(label, value));
    }
    if (options.has(previous)) control.value = previous;
    return control.value;
}
function render() {
    finishMove();
    renderTrips();
    const trip = trips.find(t => t.id === activeTrip);
    const members = trip ? new Set(trip.places) : null;
    const collection = members ? places.filter(p => members.has(p.id)) : places;
    const country = geographicOptions("countryFilter", "country", collection, "All countries");
    const inCountry = collection.filter(p => !country || p.country.toLowerCase() === country);
    const city = geographicOptions("cityFilter", "city", inCountry, "All cities");
    const selected = el("filter").value;
    const visible = inCountry.filter(p => (!city || p.city.toLowerCase() === city) && (!selected || p.category === selected));
    el("places").replaceChildren();
    pins.clearLayers();
    el("total").textContent = places.length + (places.length === 1 ? " destination" : " destinations");
    if (!visible.length) el("places").append(node("p", trip && !collection.length ? "This trip is empty. Edit the trip to add saved places, or pin a new destination." : places.length ? "No destinations match these filters." : "Your saved places will appear here. Search for a place or click the map to add one.", "empty"));
    for (const p of visible) {
        const dot = node("span", "", "pin-dot");
        dot.style.backgroundColor = categories[p.category][1];
        const marker = L.marker([p.lat, p.lon], {
            title:p.name, draggable:false, autoPan:true,
            icon:L.divIcon({className:"travel-pin", html:dot, iconSize:[24,24], iconAnchor:[12,12]})
        }).addTo(pins);
        marker.bindTooltip(node("span", p.name));
        marker.on("click", () => { if (!moving) edit(p); });
        const card = node("article", "");
        card.append(node("h3", p.name), badge(p.category));
        if (p.location) card.append(node("div",p.location,"meta"));
        card.append(node("div",p.lat.toFixed(6) + ", " + p.lon.toFixed(6),"position"));
        const details = node("details", "", "place-details");
        details.append(node("summary", "Details and notes"));
        const facts = node("dl", "");
        const rows = [
            ["Type", p.place_type], ["City", p.city], ["Country", p.country],
            ["Address", p.location], ["Visit status", categories[p.category][0]],
            ["Estimated cost", p.cost ? p.cost + " " + p.currency : ""],
            ["Notes", p.notes]
        ];
        for (const [label, value] of rows) {
            facts.append(node("dt",label), node("dd",value || "—"));
        }
        details.append(facts);
        card.append(details);
        const actions = node("div","","actions");
        actions.append(action("Show on map", () => {focusPlace(p); marker.openTooltip();}),
            action("Edit", () => edit(p)), action("Move pin", () => startMove(p,marker)), action("Delete", () => {
                deleting = p.id;
                el("deleteName").textContent = p.name;
                el("deleteError").textContent = "";
                el("deleteDialog").showModal();
            }));
        card.append(actions);
        el("places").append(card);
    }
}
function refresh(first=false, afterRefresh=null) {
    journal.state(raw => {
        const state = JSON.parse(raw);
        places = state.places;
        trips = state.trips || [];
        el("newTrip").disabled = false;
        categories = state.categories;
        if (first) {
            for (const [key,[label]] of Object.entries(categories)) {
                el("category").add(new Option(label,key));
                el("filter").add(new Option(label,key));
                el("legend").append(badge(key));
            }
            if (places.length) map.fitBounds(places.map(p => [p.lat,p.lon]), {padding:[40,40],maxZoom:16});
        }
        if (afterRefresh) afterRefresh();
        else render();
    });
}
new QWebChannel(qt.webChannelTransport, channel => {
    journal = channel.objects.journal;
    journal.results.connect(raw => {
        const {error,matches} = JSON.parse(raw);
        el("searchBtn").disabled = false;
        el("results").replaceChildren();
        el("searchStatus").textContent = error || (matches.length ? "Choose a result to pin it." : "No places found. Try adding a city or country.");
        for (const p of matches || []) el("results").append(action(p.location, () => {focusPlace(p); edit(p);}, "result"));
    });
    refresh(true);
});
map.on("click", e => {
    if (!journal || moving) return;
    const point = e.latlng.wrap();
    edit({lat:+point.lat.toFixed(7),lon:+point.lng.toFixed(7)});
});
el("searchForm").onsubmit = e => {
    e.preventDefault();
    const query = el("query").value.trim();
    if (!journal || !query || el("searchBtn").disabled) return;
    el("results").replaceChildren();
    el("searchStatus").textContent = "Searching…";
    el("searchBtn").disabled = true;
    journal.search(query);
};
for (const id of ["filter", "countryFilter", "cityFilter"]) el(id).onchange = render;
el("cancel").onclick = () => el("editor").close();
el("keep").onclick = () => el("deleteDialog").close();
el("confirmDelete").onclick = () => journal.remove(deleting, err => {
    if (err) { el("deleteError").textContent = err; return; }
    el("deleteDialog").close();
    refresh();
});
el("editForm").onsubmit = e => {
    e.preventDefault();
    const record = {id:editing,name:el("placeName").value,location:el("location").value,
        category:el("category").value,lat:el("lat").valueAsNumber,lon:el("lon").valueAsNumber};
    record.osm_key = sourceKey;
    record.trip_ids = checkedIds("memberships");
    for (const field of detailFields) record[field] = el(field).value;
    const submit = el("editForm").querySelector("footer button:last-child");
    submit.disabled = true;
    journal.save(JSON.stringify(record), err => {
        submit.disabled = false;
        if (err) { el("editError").textContent = err; return; }
        el("editor").close();
        if (el("filter").value !== record.category) el("filter").value = "";
        for (const field of ["country", "city"]) {
            const control = el(field + "Filter");
            if (control.value !== record[field].trim().toLowerCase()) control.value = "";
        }
        focusPlace(record);
        refresh();
    });
};
