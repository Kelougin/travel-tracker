"use strict";
const el = id => document.getElementById(id);
const map = L.map("map", {worldCopyJump:true, minZoom:2, maxZoom:20}).setView([27, 12], 2);
const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxNativeZoom:19, maxZoom:20,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
}).addTo(map);
tiles.on("tileerror", () => { el("tileError").hidden = false; });
tiles.on("tileload", () => { el("tileError").hidden = true; });
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
function badge(key) {
    const [label, color] = categories[key];
    const result = node("span", label, "status");
    const dot = node("i", "", "dot");
    dot.style.backgroundColor = color;
    result.prepend(dot);
    return result;
}
function focusPlace(p) { map.setView([p.lat,p.lon], 17); }
function edit(p) {
    editing = p.id || null;
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
function render() {
    const selected = el("filter").value;
    const visible = places.filter(p => !selected || p.category === selected);
    el("places").replaceChildren();
    pins.clearLayers();
    el("total").textContent = places.length + (places.length === 1 ? " destination" : " destinations");
    if (!visible.length) el("places").append(node("p", places.length ? "No destinations with this status." : "Your saved places will appear here. Search for a place or click the map to add one.", "empty"));
    for (const p of visible) {
        const marker = L.circleMarker([p.lat,p.lon], {radius:9,color:"#fff",weight:2,fillColor:categories[p.category][1],fillOpacity:1,bubblingMouseEvents:false}).addTo(pins);
        marker.bindTooltip(node("span", p.name));
        marker.on("click", () => edit(p));
        const card = node("article", "");
        card.append(node("h3", p.name), badge(p.category));
        if (p.location) card.append(node("div",p.location,"meta"));
        card.append(node("div",p.lat.toFixed(6) + ", " + p.lon.toFixed(6),"position"));
        const actions = node("div","","actions");
        actions.append(action("Show on map", () => {focusPlace(p); marker.openTooltip();}),
            action("Edit", () => edit(p)), action("Delete", () => {
                deleting = p.id;
                el("deleteName").textContent = p.name;
                el("deleteError").textContent = "";
                el("deleteDialog").showModal();
            }));
        card.append(actions);
        el("places").append(card);
    }
}
function refresh(first=false) {
    journal.state(raw => {
        const state = JSON.parse(raw);
        places = state.places;
        categories = state.categories;
        if (first) {
            for (const [key,[label]] of Object.entries(categories)) {
                el("category").add(new Option(label,key));
                el("filter").add(new Option(label,key));
                el("legend").append(badge(key));
            }
            if (places.length) map.fitBounds(places.map(p => [p.lat,p.lon]), {padding:[40,40],maxZoom:16});
        }
        render();
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
    if (!journal) return;
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
el("filter").onchange = render;
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
    const submit = el("editForm").querySelector("footer button:last-child");
    submit.disabled = true;
    journal.save(JSON.stringify(record), err => {
        submit.disabled = false;
        if (err) { el("editError").textContent = err; return; }
        el("editor").close();
        el("filter").value = "";
        focusPlace(record);
        refresh();
    });
};
