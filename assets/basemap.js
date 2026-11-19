// Keep the raster map available until the English vector layer has drawn.
async function useEnglishBasemap(map, raster) {
    const canvas = document.createElement("canvas");
    if (!canvas.getContext("webgl2")) return;
    const url = "https://tiles.openfreemap.org/styles/positron";
    let layer;
    let timer;
    function fallback() {
        clearTimeout(timer);
        if (layer && map.hasLayer(layer)) map.removeLayer(layer);
        if (!map.hasLayer(raster)) raster.addTo(map);
    }
    try {
        const response = await fetch(url, {signal: AbortSignal.timeout(10000)});
        if (!response.ok) return;
        const style = await response.json();
        for (const symbol of style.layers) {
            const field = symbol.layout?.["text-field"];
            if (field && JSON.stringify(field).includes("name")) {
                symbol.layout["text-field"] = ["coalesce", ["get","name:en"], ["get","name_en"],
                    ["get","name:latin"], ["get","name"]];
            }
        }
        layer = L.maplibreGL({style, interactive:false, attributionControl:{
            customAttribution:'<a href="https://openfreemap.org/">OpenFreeMap</a> · OpenMapTiles · CARTO · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>'
        }}).addTo(map);
        const gl = layer.getMaplibreMap();
        timer = setTimeout(fallback, 15000);
        gl.once("load", () => {
            clearTimeout(timer);
            if (map.hasLayer(layer)) {
                raster.remove();
                document.getElementById("tileError").hidden = true;
            }
        });
        gl.once("webglcontextlost", fallback);
    } catch {
        fallback();
    }
}
