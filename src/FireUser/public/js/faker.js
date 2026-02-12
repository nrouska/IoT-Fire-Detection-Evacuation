var map = L.map('map', {
    center: [38.2874913, 21.785995],
    zoom: 15
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var selectedMarker = null;
var lat = null;
var lng = null;

if (localStorage.getItem('lat') && localStorage.getItem('lng')) {
    lat = parseFloat(localStorage.getItem('lat'));
    lng = parseFloat(localStorage.getItem('lng'));
    selectedMarker = L.marker([lat, lng]).addTo(map);
    selectedMarker.bindPopup(`Selected Location:<br>${lat.toFixed(6)}, ${lng.toFixed(6)}`).openPopup();
}

map.on('click', function (e) {
    lat = e.latlng.lat;
    lng = e.latlng.lng;

    // Remove old marker if it exists
    if (selectedMarker) {
        map.removeLayer(selectedMarker);
    }

    // Add new marker
    selectedMarker = L.marker([lat, lng]).addTo(map);

    // Optional popup
    selectedMarker.bindPopup(`Selected Location:<br>${lat.toFixed(6)}, ${lng.toFixed(6)}`).openPopup();

    // Log coordinates (or send to backend)
    console.log("Selected location:", lat, lng);
});


document.getElementById('save').addEventListener('click', (e) => {
    localStorage.setItem("lat", lat);
    localStorage.setItem("lng", lng);
    window.location.href = "/";
})

document.getElementById('clear').addEventListener('click', (e) => {
    localStorage.clear();
    window.location.href = "/";
})