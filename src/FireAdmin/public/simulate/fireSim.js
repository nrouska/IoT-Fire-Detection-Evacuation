
// 1. Initialize Map
var map = L.map('map', { center: [38.2875, 21.7860], zoom: 16 });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Layers
var contextLayer = L.layerGroup().addTo(map); 
var fireLayer = L.layerGroup().addTo(map);    
var pathLayer = L.layerGroup().addTo(map);   
var peopleLayer = L.layerGroup().addTo(map); 

let selectedFireLoc = null;

const buildingIcon = L.divIcon({
    html: '<span class="material-symbols-outlined" style="color: #d35400; font-size: 30px; text-shadow: 2px 2px white;">apartment</span>',
    className: 'custom-icon', iconSize: [30, 30], iconAnchor: [15, 15]
});

const exitIcon = L.divIcon({
    html: '<span class="material-symbols-outlined" style="color: #27ae60; font-size: 30px; text-shadow: 2px 2px white;">door_open</span>',
    className: 'custom-icon', iconSize: [30, 30], iconAnchor: [15, 15]
});

const fireIcon = L.divIcon({ 
    html: '🔥', 
    className: 'emoji-icon', 
    iconSize: [30, 30], 
    iconAnchor: [15, 15] 
});


// --- 1. TEST FIRE BUTTON ---
const btnTestFire = document.getElementById('btnTestFire');
if (btnTestFire) {
    btnTestFire.addEventListener('click', async () => {
        const originalText = btnTestFire.innerText;
        btnTestFire.innerText = "Sending...";
        btnTestFire.style.background = "#bdc3c7"; // Grey out
        btnTestFire.disabled = true;

        try {
            const res = await fetch('/api/test/simulate');
            const data = await res.json();
            console.log(data.message); // Log to console instead of alert
            
            btnTestFire.innerText = "Sent!";
            btnTestFire.style.background = "#2ecc71"; // Green success
        } catch (e) {
            console.error(e);
            btnTestFire.innerText = "Error";
            btnTestFire.style.background = "#c0392b";
        } finally {
            // Reset button after 2 seconds
            setTimeout(() => {
                btnTestFire.innerText = originalText;
                btnTestFire.style.background = "#e74c3c"; // Original Red
                btnTestFire.disabled = false;
            }, 2000);
        }
    });
}

// --- 2. RESET BUTTON ---
const btnReset = document.getElementById('btnReset');
if (btnReset) {
    btnReset.addEventListener('click', async () => {
        const originalText = btnReset.innerText;
        btnReset.innerText = "Resetting...";
        btnReset.style.background = "#bdc3c7";
        btnReset.disabled = true;

        try {
            const res = await fetch('/api/test/reset', { method: 'POST' });
            const data = await res.json();
            console.log(data.message);

            // Clear markers from map immediately
            if (window.carMarkers) {
                Object.values(window.carMarkers).forEach(marker => map.removeLayer(marker));
                window.carMarkers = {};
            }
            
            btnReset.innerText = "Reset!";
        } catch (e) {
            console.error(e);
            btnReset.innerText = "Error";
        } finally {
            setTimeout(() => {
                btnReset.innerText = originalText;
                btnReset.style.background = "#27ae60"; // Original Green
                btnReset.disabled = false;
            }, 2000);
        }
    });
}

async function loadMapContext() {
    const res = await fetch('/api/map/all');
    const data = await res.json();

    if(data.buildings) {
        data.buildings.forEach(b => {
            L.marker([b.lat, b.lng], { icon: buildingIcon }) // <--- Uses the nice icon
             .bindTooltip(`<b>${b.name}</b>`, {permanent: true, direction: 'top', offset: [0,-20]})
             .addTo(contextLayer);
        });
    }

    if(data.exits) {
        data.exits.forEach(e => {
            L.marker([e.lat, e.lng], { icon: exitIcon }) 
             .bindTooltip(`EXIT: ${e.name}`, { direction: 'bottom', offset: [0,15] })
             .addTo(contextLayer);
        });
    }
}

map.on('click', function(e) {
    selectedFireLoc = e.latlng;

    fireLayer.clearLayers();
    pathLayer.clearLayers(); 
    
    L.marker(selectedFireLoc, {icon: fireIcon}).addTo(fireLayer);
    
    L.circle(selectedFireLoc, {
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.3,
        radius: 40
    }).addTo(fireLayer);
});

var commandControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function (map) {
        var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control custom-btn');
        container.innerHTML = 'RUN SIMULATION ▶';
        container.style.backgroundColor = 'white';
        container.style.padding = '10px';
        container.style.cursor = 'pointer';
        container.style.fontWeight = 'bold';
        
        L.DomEvent.disableClickPropagation(container);
        
        container.onclick = runSimulation;
        return container;
    }
});
map.addControl(new commandControl());

async function runSimulation() {
    if (!selectedFireLoc) {
        alert("Please click on the map to place a fire first!");
        return;
    }

    console.log("Sending Simulation Request...");
    
    try {
        const response = await fetch('/api/simulation/calculate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                lat: selectedFireLoc.lat, 
                lng: selectedFireLoc.lng 
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            drawPaths(data.paths,data.buildingData);
        } else {
            alert("Simulation failed: " + (data.message || "Unknown error"));
        }
    } catch (err) {
        console.error(err);
        alert("Network Error");
    }
}


function getRandomColor() {
    return '#' + Math.floor(Math.random()*16777215).toString(16);
}


function animatePedestrians(pathLatlngs, color) {
    if (pathLatlngs.length < 2) return;

    const person = L.circleMarker(pathLatlngs[0], {
        radius: 5,
        color: 'white',
        fillColor: color,
        fillOpacity: 1,
        interactive: false 
    }).addTo(peopleLayer);

    
    let step = 0;
    
    function moveNext() {
        if (step < pathLatlngs.length - 1) {
            step++;
            
            const duration = 400; 
            person.setLatLng(pathLatlngs[step]);
            setTimeout(moveNext, duration);
        } else {

            person.getElement().style.transition = "opacity 1s";
            person.setOpacity(0);
            setTimeout(() => person.remove(), 1000);
        }
    }

    moveNext();
}

function drawPaths(allPaths, buildingData) { 
    pathLayer.clearLayers();
    peopleLayer.clearLayers();

    Object.keys(allPaths).forEach(buildingId => {
        const routes = allPaths[buildingId];
        const color = getRandomColor();

      
        const bInfo = buildingData.find(b => b.id === buildingId);
        const totalPeople = bInfo ? bInfo.people : 50;

        const dotsToSpawn = Math.ceil(totalPeople / 10);

        routes.forEach((pathPoints, i) => {
            const latLngs = pathPoints.map(p => [p.lat, p.lng]);

            L.polyline(latLngs, {
                color: color,
                weight: 5,
                opacity: 0.6,
                dashArray: '5, 10'
            }).addTo(pathLayer);

            for (let j = 0; j < dotsToSpawn; j++) {
                setTimeout(() => {
                    animatePedestrians(latLngs, color);
                }, j * 1200); 
            }
        });
    });
}
loadMapContext();