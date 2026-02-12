import { showPath } from "./evacuation_overlay.js";

var map = L.map('map', {
    center: [38.2874913,21.785995,],
    zoom: 15
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var userMarker = null
var userCircle = null

let hasPathBeenShown = false;

function onLocationChange(e) {
    if (userMarker && userCircle) {
        userMarker.remove();
        userCircle.remove();
    }

    // Add marker
    userMarker = L.marker(e.latlng).addTo(map)
        .bindPopup("You are here").openPopup();

    // Add accuracy circle
    userCircle = L.circle(e.latlng, e.accuracy).addTo(map);

    map.panTo(e.latlng);

    fetch("/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            latlng: e.latlng,
            accuracy: e.accuracy
        })
    })
        .then(res => res.json())
        .then(data => {
            if (hasPathBeenShown) return;
            var apId = data['apId'];
            console.log(apId)
            showPath(apId)
            hasPathBeenShown = true;
        })
        .catch(err => console.error(err));

}

// When location is found
map.on('locationfound', onLocationChange);
// When location fails (user blocks it)
map.on('locationerror', function (e) {
    //alert("Could not get your location: " + e.message);
});

setInterval(()=>{
    if (localStorage.getItem('lat') && localStorage.getItem('lng')) {
        onLocationChange({
            "latlng": {
                lat: parseFloat(localStorage.getItem('lat')),
                lng: parseFloat(localStorage.getItem('lng')),
            },
            "accuracy": 35
        });
    } else {
        // Ask browser for location
        map.locate({ setView: true, maxZoom: 16 });
    }
}, 1000)

window.map = map;

// Example coordinate list
// const points = [
//     [38.28707810119503, 21.789928502814767],
//     [38.286941559204244, 21.78738926992495],
//     [38.29027785540383, 21.784557793798218]
// ];

// // Create polyline
// const path = L.polyline(points, {
//     color: 'blue',
//     weight: 4
// }).addTo(map);

// Zoom map to fit path
//map.fitBounds(path.getBounds());

// Fire location coordinates
// const fireLocation = [38.28492985658273, 21.786146456990316]

// --- Outer orange circle (e.g., warning zone) ---
// L.circle(fireLocation, {
//     radius: 300,       // meters
//     color: "orange",
//     fillColor: "orange",
//     fillOpacity: 0.3
// }).addTo(map);

// --- Inner red circle (e.g., danger zone) ---
// L.circle(fireLocation, {
//     radius: 100,        // meters
//     color: "red",
//     fillColor: "red",
//     fillOpacity: 0.6
// }).addTo(map);

// // Optional popup
// L.marker(fireLocation)
//     .addTo(map)
//     .bindPopup("🔥 Fire Detected Here");
