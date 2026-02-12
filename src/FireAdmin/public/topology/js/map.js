// public/topology/js/map.js

var map = L.map('map', { center: [38.2875, 21.7860], zoom: 16 });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let mode = 'view'; // 'view', 'add_building', 'add_exit', 'moving_item'
let tempLatLng = null;
let selectedItem = null; // { id, type, name, marker }

// --- UI ELEMENTS ---
const instructionBox = document.getElementById('instructionBox');
const nameModal = document.getElementById('nameModal');
const elementNameInput = document.getElementById('elementNameInput');
const modalTypeSpan = document.getElementById('modalTypeSpan');
const connCountInput = document.getElementById('connCountInput');

// Footer Panel Elements
const selectionPanel = document.getElementById('selectionPanel');
const selectedName = document.getElementById('selectedName');
const selectedId = document.getElementById('selectedId');
const btnInitMove = document.getElementById('btnInitMove');
const btnInitDelete = document.getElementById('btnInitDelete');
const btnClosePanel = document.getElementById('btnClosePanel');

// --- ICONS ---
const buildingIcon = L.divIcon({ html: '<span class="material-symbols-outlined" style="color: #d35400; font-size: 30px;">apartment</span>', className: 'custom-icon', iconSize: [30, 30], iconAnchor: [15, 15] });
const exitIcon = L.divIcon({ html: '<span class="material-symbols-outlined" style="color: #27ae60; font-size: 30px;">door_open</span>', className: 'custom-icon', iconSize: [30, 30], iconAnchor: [15, 15] });

// --- TOAST ---
function showToast(message, isError = false) {
    const toast = document.getElementById('statusToast');
    if (!toast) return;
    toast.innerText = message;
    toast.className = ''; 
    toast.classList.add(isError ? 'error' : 'success');
    toast.style.visibility = 'visible';
    requestAnimationFrame(() => { toast.classList.add('show'); });
    setTimeout(() => { 
        toast.classList.remove('show'); 
        toast.style.visibility = 'hidden';
    }, 3000);
}

function drawCameraFOV(lat, lng, angle, fov) {
    if (angle === undefined || fov === undefined || angle === "" || fov === "") return;

    const center = { lat: parseFloat(lat), lng: parseFloat(lng) };
    const viewDist = 70; // Outer range of camera
    const offsetDist = 5; // ✅ Pushes the cone 5 meters away from the icon

    const numAngle = parseFloat(angle);
    const numFov = parseFloat(fov);

    // 1. Calculate the starting point of the cone (Offset from the icon)
    // This moves the "tip" of the triangle away from the camera marker
    const coneStart = getDestination(center, numAngle, offsetDist);

    const points = [coneStart]; 
    
    const step = 5; 
    const startAngle = numAngle - (numFov / 2);
    const endAngle = numAngle + (numFov / 2);

    // 2. Calculate the Arc (Outer edge)
    // We still measure distance from the original center to keep the arc true
    for (let a = startAngle; a <= endAngle; a += step) {
        points.push(getDestination(center, a, viewDist));
    }
    points.push(getDestination(center, endAngle, viewDist));

    // 3. Draw the Polygon
    L.polygon(points, { 
        color: '#0d6efd', 
        weight: 1, 
        opacity: 0.6, 
        fillColor: '#0d6efd', 
        fillOpacity: 0.15, 
        interactive: false,
        smoothFactor: 1.0
    }).addTo(map);

    // 4. (Optional) Dashed Line from Icon to Cone
    // Connects the marker to the view so they still feel attached
    L.polyline([center, coneStart], {
        color: '#0d6efd',
        weight: 1,
        dashArray: '2, 5',
        opacity: 0.5,
        interactive: false
    }).addTo(map);
}

function getDestination(start, bearing, dist) {
    const R = 6378137; // Earth Radius (meters)
    const d = dist / R;
    const brng = bearing * Math.PI / 180;
    const lat1 = start.lat * Math.PI / 180;
    const lon1 = start.lng * Math.PI / 180;

    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));

    return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}


document.getElementById('btnBuilding').addEventListener('click', () => {
    closePanel();
    mode = 'add_building';
    instructionBox.innerText = "Click map to add BUILDING (Esc to cancel)";
    instructionBox.style.display = 'block';
    map.getContainer().style.cursor = 'crosshair';
});

document.getElementById('btnExit').addEventListener('click', () => {
    closePanel();
    mode = 'add_exit';
    instructionBox.innerText = "Click map to add EXIT (Esc to cancel)";
    instructionBox.style.display = 'block';
    map.getContainer().style.cursor = 'copy';
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // 1. If Modal is Open -> Close it
        if (nameModal.style.display === 'flex') {
            nameModal.style.display = 'none';
            mode = 'view';
            instructionBox.style.display = 'none';
            map.getContainer().style.cursor = '';
            return;
        }

        // 2. If in specific Mode (Add/Move) -> Cancel to View
        if (mode !== 'view') {
            closePanel(); // Resets everything
            showToast("Action Cancelled", false);
        }
        
        // 3. If Panel is Open -> Close it
        if (selectionPanel.style.display === 'flex') {
            closePanel();
        }
    }
});

// --- MAP CLICK HANDLER ---
map.on('click', function(e) {
    // 1. CLICK TO MOVE LOGIC
    if (mode === 'moving_item' && selectedItem) {
        confirmMove(e.latlng); 
        return;
    }

    // 2. ADD NEW ITEM LOGIC
    if (mode === 'add_building' || mode === 'add_exit') {
        tempLatLng = e.latlng;
        modalTypeSpan.innerText = (mode === 'add_building') ? 'Building' : 'Exit';
        connCountInput.value = (mode === 'add_building') ? 3 : 1;
        elementNameInput.value = '';
        nameModal.style.display = 'flex';
        elementNameInput.focus();
        instructionBox.style.display = 'none';
        map.getContainer().style.cursor = '';
        return;
    }

    closePanel();
});

// --- SELECTION LOGIC ---
function selectItem(item, type, marker) {
    selectedItem = { ...item, type, marker };
    
    // Show Footer Panel
    selectedName.innerText = item.name;
    selectedId.innerText = `${type.toUpperCase()} (ID: ${item.id})`;
    selectionPanel.style.display = 'flex';
    
    // Ensure we are in view mode
    mode = 'view';
    instructionBox.style.display = 'none';
    map.getContainer().style.cursor = '';
}

function closePanel() {
    selectionPanel.style.display = 'none';
    selectedItem = null;
    mode = 'view';
    instructionBox.style.display = 'none';
    map.getContainer().style.cursor = '';
}

// --- ACTION BAR BUTTONS ---

// 1. DELETE (Instant)
btnInitDelete.addEventListener('click', async () => {
    if (!selectedItem) return;

    showToast("Deleting...", false);

    try {
        const res = await fetch(`/api/map/${selectedItem.type}/${selectedItem.id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast("Item Deleted");
            closePanel();
            loadMap();
        } else {
            showToast("Error Deleting", true);
        }
    } catch (e) { console.error(e); }
});

// 2. MOVE (Start "Moving Mode")
btnInitMove.addEventListener('click', () => {
    if (!selectedItem) return;
    
    mode = 'moving_item'; 
    selectionPanel.style.display = 'none'; 
    
    instructionBox.innerText = `Click new location for ${selectedItem.name} (Esc to cancel)`;
    instructionBox.style.display = 'block';
    instructionBox.style.background = "#0d6efd"; 
    map.getContainer().style.cursor = 'crosshair';
});

// 3. EXECUTE MOVE (Called by Map Click)
async function confirmMove(latlng) {
    try {
        const res = await fetch(`/api/map/${selectedItem.type}/${selectedItem.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: latlng.lat, lng: latlng.lng })
        });

        if (res.ok) {
            showToast("Location Updated");
            loadMap();
        } else {
            showToast("Move Failed", true);
        }
    } catch (e) { 
        console.error(e);
        showToast("Network Error", true);
    }
    
    // Reset State
    closePanel();
    instructionBox.style.background = "#333";
}

btnClosePanel.addEventListener('click', closePanel);

// --- ADD NEW ITEM (Modal Save) ---
document.getElementById('saveNameBtn').addEventListener('click', async () => {
    const name = document.getElementById('elementNameInput').value;
    const connections = parseInt(connCountInput.value) || 1;

    if (!name) { alert("Enter a name"); return; }

    const url = (mode === 'add_building') ? '/api/map/building' : '/api/map/exit';

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, lat: tempLatLng.lat, lng: tempLatLng.lng, connections })
        });

        if (res.ok) {
            loadMap();
            showToast(`${name} Added!`);
            nameModal.style.display = 'none';
            mode = 'view';
            instructionBox.style.display = 'none';
        } else {
            const d = await res.json();
            showToast( d.error, true);
        }
    } catch(err) { showToast("Network Error", true); }
});

document.getElementById('cancelNameBtn').addEventListener('click', () => {
    nameModal.style.display = 'none';
    mode = 'view';
    instructionBox.style.display = 'none';
});

// --- LOAD MAP DATA ---
async function loadMap() {
    map.eachLayer(layer => { if (!layer._url) map.removeLayer(layer); });

    try {
        const res = await fetch('/api/map/all');
        const data = await res.json();

        // Buildings
        // 1. BUILDINGS (Updated Logic)
        if(data.buildings) {
            data.buildings.forEach(b => {
                
                // ✅ FIND LINKED AP (Match by "connectedTo" OR by "Name")
                const linkedAP = data.devices ? data.devices.find(d => 
                    d.type === 'AccessPoint' && (
                        (d.config && d.config.connectedTo === b.name) || // Linked via settings
                        d.name === b.name // Linked because names match (e.g. "KTIRIO_A")
                    )
                ) : null;

                // ✅ DEFINE POPUP CONTENT
                let popupContent = `<div style="text-align:center;"><b>${b.name}</b></div>`;

                if (linkedAP) {
                    // Connected: Show People Count
                    popupContent += `
                        <hr style="margin: 5px 0;">
                        <div style="font-size: 1.1em;">
                            People: <b>${linkedAP.peopleCount || 0}</b>
                        </div>
                        <div style="color: #1e8e3e; font-size: 0.8em; margin-top: 3px;">
                            Source: ${linkedAP.name}
                        </div>`;
                } else {
                    // Not Connected: Show Warning
                    popupContent += `
                        <hr style="margin: 5px 0;">
                        <div style="color: #d93025; font-weight: bold; font-size: 0.9em;">
                            <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">warning</span>
                            No AP Assigned
                        </div>
                        <div style="font-size: 0.8em; color: #666;">
                            (Name AP same as Building or link it)
                        </div>`;
                }

                // Create Marker
                const marker = L.marker([b.lat, b.lng], { icon: buildingIcon })
                 .bindTooltip(`<b>${b.name}</b>`, { direction: 'top', offset: [0,-15] })
                 .bindPopup(popupContent)
                 .addTo(map);

                marker.on('click', (e) => {
                    if (mode === 'view') {
                        marker.openPopup();
                    }
                    L.DomEvent.stopPropagation(e);
                    selectItem(b, 'building', marker);
                });
                
                if (b.connectedNodes) drawLines(b.lat, b.lng, b.connectedNodes, 'red');
            });
        }

        // Exits
        if(data.exits) {
            data.exits.forEach(exitData => {
                const marker = L.marker([exitData.lat, exitData.lng], { icon: exitIcon })
                 .bindTooltip(exitData.name, { direction: 'bottom', offset: [0,15] })
                 .addTo(map);

                marker.on('click', (ev) => {
                    L.DomEvent.stopPropagation(ev);
                    selectItem(exitData, 'exit', marker);
                });

                if (exitData.connectedNodes) drawLines(exitData.lat, exitData.lng, exitData.connectedNodes, 'green');
            });
        }
        
        // Devices
        if (data.devices) {
            data.devices.forEach(d => {
            if (d.config && d.config.lat) {
                let iconName = 'help_center'; // Default
                let color = '#5f6368';

                if (d.type === 'Camera') { 
                        iconName = 'videocam'; 
                        color = '#d93025'; // Red
                        // Draw the view cone
                        drawCameraFOV(d.config.lat, d.config.lng, d.config.angle, d.config.fov);
                    } 
                    else if (d.type === 'Radar') { iconName = 'radar'; color = '#1a73e8'; } // Blue
                    else if (d.type === 'AccessPoint') { iconName = 'router'; color = '#1e8e3e'; } // Green
                    else if (d.type === 'Parking') { iconName = 'local_parking'; color = '#f39c12'; } // Orange

                    // 2. Create "White Bubble" Marker
                    // This creates a clean white circle with a shadow, looking like a real map pin.
                    const materialIcon = L.divIcon({
                        html: `
                            <div style="
                                background-color: white; 
                                border-radius: 50%; 
                                width: 32px; height: 32px; 
                                display: flex; align-items: center; justify-content: center;
                                box-shadow: 0 2px 5px rgba(0,0,0,0.3); border: 2px solid white;">
                                <span class="material-symbols-outlined" style="color: ${color}; font-size: 20px;">
                                    ${iconName}
                                </span>
                            </div>`,
                        className: '', // Removes default Leaflet square
                        iconSize: [20, 20],
                        iconAnchor: [10, 10] // Perfectly centered
                    });

                    L.marker([d.config.lat, d.config.lng], { icon: materialIcon })
                    .bindPopup(`<b>${d.name}</b><br>Type: ${d.type}`)
                    .addTo(map);
                }
            });
        }

    } catch (e) { console.error("Error loading map data", e); }
}

function drawLines(lat, lng, nodes, color) {
    if (!nodes) return;
    nodes.forEach(n => {
        L.polyline([[lat, lng], [n.lat, n.lng]], { color: color, weight: 2, dashArray: '5, 5', opacity: 0.5 }).addTo(map);
    });
}

loadMap();