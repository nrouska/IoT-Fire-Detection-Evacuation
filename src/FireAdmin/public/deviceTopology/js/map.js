// public/topology/js/map.js

var map = L.map('map', { center: [38.2875, 21.7860], zoom: 16 });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let deviceMarker = null;
let fovPolygon = null;

// Track selected building
let selectedBuildingMarker = null; 

// --- INPUTS ---
const latInput = document.getElementById('latInput');
const lngInput = document.getElementById('lngInput');
const angleSlider = document.getElementById('angleSlider');
const angleInput = document.getElementById('angleInput');
const fovSlider = document.getElementById('fovSlider');
const fovInput = document.getElementById('fovInput');
const saveBtn = document.getElementById('saveBtn');
const orientationControls = document.getElementById('orientationControls');

// --- ACCESS POINT INPUTS ---
const apSettings = document.getElementById('apSettings');
const cameraSettings = document.getElementById('cameraSpecificSettings');

const linkedDoorInput = document.getElementById('linkedDoorInput');
const selectedDoorDisplay = document.getElementById('selectedDoorDisplay');
const radarSettings = document.getElementById('radarSettings');

// New Elements for Click-to-Select
const linkedBuildingInput = document.getElementById('linkedBuildingInput');
const selectedBuildingDisplay = document.getElementById('selectedBuildingDisplay');

// --- TOAST NOTIFICATION FUNCTION ---
function showToast(message, isError = false) {
    const toast = document.getElementById('statusToast');
    if (!toast) return;
    toast.innerText = message;
    toast.className = ''; 
    toast.classList.add(isError ? 'error' : 'success');
    requestAnimationFrame(() => { toast.classList.add('show'); });
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// 1. SETUP UI BASED ON TYPE
if (CURRENT_DEVICE_TYPE === 'AccessPoint') {
    if (apSettings) apSettings.style.display = 'block';
    if (cameraSettings) cameraSettings.style.display = 'none';
    if (orientationControls) orientationControls.style.display = 'none';
    
    // --- HIDE LAT/LNG AND THEIR LABELS ---
    if(latInput) latInput.parentElement.style.display = 'none';
    if(lngInput) lngInput.parentElement.style.display = 'none';
    
} else if (CURRENT_DEVICE_TYPE === 'Camera') {
    if (apSettings) apSettings.style.display = 'none';
    if (cameraSettings) cameraSettings.style.display = 'block';
    if (orientationControls) orientationControls.style.display = 'block';
    
    // Show
    if(latInput) latInput.parentElement.style.display = 'block';
    if(lngInput) lngInput.parentElement.style.display = 'block';

} else if (CURRENT_DEVICE_TYPE === 'Radar') {
    // Hide others
    if (apSettings) apSettings.style.display = 'none';
    if (cameraSettings) cameraSettings.style.display = 'none';
    if (orientationControls) orientationControls.style.display = 'none';
    
    if (radarSettings) radarSettings.style.display = 'block';

    // Show Lat/Lng (Radars have a location)
    if(latInput) latInput.parentElement.style.display = 'block';
    if(lngInput) lngInput.parentElement.style.display = 'block';

}else {
    // Other sensors
    if (apSettings) apSettings.style.display = 'none';
    if (cameraSettings) cameraSettings.style.display = 'none';
    if (orientationControls) orientationControls.style.display = 'none';
    
    // Show
    if(latInput) latInput.parentElement.style.display = 'block';
    if(lngInput) lngInput.parentElement.style.display = 'block';
}

// 2. LOAD DATA
(async function init() {
    try {
        const res = await fetch('/api/map/all'); 
        const data = await res.json(); 

        const bIconDefault = L.divIcon({ 
            html: '<span class="material-symbols-outlined" style="color: #d35400; font-size: 24px;">apartment</span>', 
            iconSize: [24, 24], iconAnchor: [12, 12] 
        });
        
        // --- CHANGE 2: Removed bIconSelected (No blue icon) ---

        const allBuildingMarkers = {}; 

        // A. Draw Buildings
        if (data.buildings) {
            data.buildings.forEach(b => {
                const marker = L.marker([b.lat, b.lng], { icon: bIconDefault, interactive: true })
                 .bindTooltip(b.name, { permanent: true, direction: 'top', offset: [0,-10] })
                 .addTo(map);

                marker.on('click', (e) => {
                    if (CURRENT_DEVICE_TYPE === 'AccessPoint') {
                        L.DomEvent.stopPropagation(e); 
                        if (linkedBuildingInput) linkedBuildingInput.value = b.name;
                        if (selectedBuildingDisplay) selectedBuildingDisplay.innerText = b.name;
                        showToast(`Linked to Building: ${b.name}`);
                    }
                });

                let nodes = [];
                
                // CRITICAL: Handle "StructuredValue" from FIWARE
                if (b.connectedNodes) {
                    if (Array.isArray(b.connectedNodes)) {
                        nodes = b.connectedNodes; // Plain array
                    } else if (b.connectedNodes.value && Array.isArray(b.connectedNodes.value)) {
                        nodes = b.connectedNodes.value; // Unwrapped from FIWARE object
                    }
                }

                if (nodes.length > 0) {
                    nodes.forEach((node, idx) => {
                        if (!node.lat || !node.lng) return;

                        // Use Native CircleMarker (Guaranteed Visibility)
                        const doorMarker = L.circleMarker([node.lat, node.lng], {
                            radius: 6,
                            fillColor: "#d35400", // Dark Orange/Red
                            color: "#ffffff",
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 1,
                            zIndexOffset: 1000 // Force on top
                        }).addTo(map);

                        // Click Logic
                        doorMarker.on('click', (ev) => {
                            if (CURRENT_DEVICE_TYPE === 'Radar') {
                                L.DomEvent.stopPropagation(ev);
                                
                                const doorId = node.id || `Door-${idx}`;

                                // Update Input & UI
                                if (linkedDoorInput) linkedDoorInput.value = doorId;
                                if (selectedDoorDisplay) {
                                    selectedDoorDisplay.innerText = `Door ID: ${doorId}`;
                                    selectedDoorDisplay.style.color = "#d35400";
                                }
                                showToast(`Linked to Door: ${doorId}`);
                            }
                        });
                    });
                }
            });
        }

        // B. Exits
        if (data.exits) {
            const eIcon = L.divIcon({ html: '<span class="material-symbols-outlined" style="color: #27ae60; font-size: 24px;">door_open</span>', iconSize: [24, 24], iconAnchor: [12, 12] });
            data.exits.forEach(e => {
                L.marker([e.lat, e.lng], { icon: eIcon, interactive: false }).addTo(map);
            });
        }

        // C. Fetch Current Device Config
        const devRes = await fetch(`/api/device/${CURRENT_DEVICE_ID}/topology`);
        const devConfig = await devRes.json();

        if (devConfig) {
            // Load Position
            if (devConfig.lat) {
                placeMarker(devConfig.lat, devConfig.lng);
                map.setView([devConfig.lat, devConfig.lng], 18);
            }

            // Load Camera Params
            if (CURRENT_DEVICE_TYPE === 'Camera') {
                if (devConfig.angle !== undefined) { 
                    angleSlider.value = devConfig.angle; 
                    angleInput.value = devConfig.angle; 
                }
                if (devConfig.fov !== undefined) { 
                    fovSlider.value = devConfig.fov; 
                    fovInput.value = devConfig.fov; 
                }
                updateFOV();
            }

            // Load Linked Building (Access Point)
            if (CURRENT_DEVICE_TYPE === 'AccessPoint' && devConfig.linkedBuilding) {
                const savedName = devConfig.linkedBuilding;
                
                // Update UI Text
                if (linkedBuildingInput) linkedBuildingInput.value = savedName;
                if (selectedBuildingDisplay) {
                    selectedBuildingDisplay.innerText = savedName;
                    // selectedBuildingDisplay.style.color = "#0d6efd"; // REMOVED
                }

                
            }
            if (CURRENT_DEVICE_TYPE === 'Radar' && devConfig.connectedTo) {
                if (linkedDoorInput) linkedDoorInput.value = devConfig.connectedTo;
                if (selectedDoorDisplay) {
                    selectedDoorDisplay.innerText = `Door ID: ${devConfig.connectedTo}`;
                    selectedDoorDisplay.style.color = "#d35400";
                }
            }
        }

    } catch (e) { console.error("Error loading map:", e); }
})();

// 3. MAP INTERACTIONS
map.on('click', function(e) {
    // Only place marker if NOT an Access Point (since APs use links)
    if (CURRENT_DEVICE_TYPE !== 'AccessPoint') {
        placeMarker(e.latlng.lat, e.latlng.lng);
        if (CURRENT_DEVICE_TYPE === 'Camera') updateFOV();
    }
});

function placeMarker(lat, lng) {
    if (deviceMarker) map.removeLayer(deviceMarker);
    deviceMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
    latInput.value = lat.toFixed(6);
    lngInput.value = lng.toFixed(6);
    
    deviceMarker.on('drag', function(ev) {
        const pos = ev.target.getLatLng();
        latInput.value = pos.lat.toFixed(6);
        lngInput.value = pos.lng.toFixed(6);
        if (CURRENT_DEVICE_TYPE === 'Camera') updateFOV();
    });
}

function updateFOV() {
    if (CURRENT_DEVICE_TYPE !== 'Camera') return;
    if (!deviceMarker) return;
    if (fovPolygon) map.removeLayer(fovPolygon);
    
    const center = deviceMarker.getLatLng();
    const angle = parseInt(angleInput.value);
    const width = parseInt(fovInput.value);
    
    const p2 = getDestination(center, angle - (width/2), 60);
    const p3 = getDestination(center, angle + (width/2), 60);
    
    fovPolygon = L.polygon([center, p2, p3], { color: '#0d6efd', fillOpacity: 0.3, weight: 1 }).addTo(map);
}

// Sync Sliders
if (angleSlider) {
    angleSlider.addEventListener('input', (e) => { angleInput.value = e.target.value; updateFOV(); });
    angleInput.addEventListener('input', (e) => { angleSlider.value = e.target.value; updateFOV(); });
    fovSlider.addEventListener('input', (e) => { fovInput.value = e.target.value; updateFOV(); });
    fovInput.addEventListener('input', (e) => { fovSlider.value = e.target.value; updateFOV(); });
}

function getDestination(start, bearing, dist) {
    const R = 6378137; 
    const d = dist / R;
    const brng = bearing * Math.PI / 180;
    const lat1 = start.lat * Math.PI / 180;
    const lon1 = start.lng * Math.PI / 180;
    const lat2 = Math.asin(Math.sin(lat1)*Math.cos(d) + Math.cos(lat1)*Math.sin(d)*Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng)*Math.sin(d)*Math.cos(lat1), Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
    return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

// 4. MAIN SAVE BUTTON
saveBtn.addEventListener('click', () => {
    
    const isAP = (CURRENT_DEVICE_TYPE === 'AccessPoint');
    const linkedB = linkedBuildingInput ? linkedBuildingInput.value : null;

    // VALIDATION:
    // 1. Not AP = Must have marker
    if (!isAP && !deviceMarker) {
        showToast("Please place the device on the map.", true);
        return;
    }

    // 2. AP = Must have Link (since markers and lat/lng inputs are hidden)
    if (isAP && (!linkedB || linkedB === "")) {
        showToast("Please click a building to link.", true);
        return;
    }

    const payload = {};

    if (deviceMarker) {
        payload.lat = parseFloat(latInput.value);
        payload.lng = parseFloat(lngInput.value);
    }

    if (CURRENT_DEVICE_TYPE === 'AccessPoint') {
        if (apSettings) apSettings.style.display = 'block';
        if (cameraSettings) cameraSettings.style.display = 'none';
        if (orientationControls) orientationControls.style.display = 'none';
        
        // --- HIDE LAT/LNG INPUTS FOR AP ---
        if(latInput) latInput.parentElement.style.display = 'none'; // Hides label + input
        if(lngInput) lngInput.parentElement.style.display = 'none';

    } else if (CURRENT_DEVICE_TYPE === 'Camera') {
        if (apSettings) apSettings.style.display = 'none';
        if (cameraSettings) cameraSettings.style.display = 'block';
        if (orientationControls) orientationControls.style.display = 'block';
        
        // Show Lat/Lng
        if(latInput) latInput.parentElement.style.display = 'block';
        if(lngInput) lngInput.parentElement.style.display = 'block';
        
        payload.angle = document.getElementById('angleInput').value;
        payload.fov = document.getElementById('fovInput').value;
        payload.camHeight = document.getElementById('camHeightInput').value;
        payload.calibrationC = document.getElementById('calibrationInput').value;
    
    } else {
        // Other sensors
        if (apSettings) apSettings.style.display = 'none';
        if (cameraSettings) cameraSettings.style.display = 'none';
        if (orientationControls) orientationControls.style.display = 'none';
        
        // Show Lat/Lng
        if(latInput) latInput.parentElement.style.display = 'block';
        if(lngInput) lngInput.parentElement.style.display = 'block';
    }

    if (isAP && linkedB) {
        payload.linkedBuilding = linkedB;
    }

    if (CURRENT_DEVICE_TYPE === 'Radar') {
        const doorId = linkedDoorInput ? linkedDoorInput.value : null;
        if (doorId) {
            payload.connectedTo = doorId; // Send to backend
        }
    }

    fetch(`/api/device/${CURRENT_DEVICE_ID}/topology`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        showToast("Settings Saved!");
        setTimeout(() => { window.location.href = '/devices'; }, 1000);
    })
    .catch(e => showToast("Error saving", true));
});

// Calibration Logic (Unchanged)
const calibModal = document.getElementById('calibModal');
if (calibModal) {
    const calibImg = document.getElementById('calibImg');
    const calibCanvas = document.getElementById('calibCanvas');
    const ctx = calibCanvas.getContext('2d');
    const objSelect = document.getElementById('calibObjectSelect');
    const customBox = document.getElementById('customHeightBox');

    let isDrawing = false;
    let startX, startY, endX, endY;

    // Helper: Sync Canvas size to Image size
    function resizeCanvas() {
        if (calibImg.clientWidth > 0 && calibImg.clientHeight > 0) {
            calibCanvas.width = calibImg.clientWidth;
            calibCanvas.height = calibImg.clientHeight;
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 3;
        }
    }

    if (objSelect) {
        objSelect.addEventListener('change', () => {
            if (objSelect.value === 'custom') {
                customBox.style.display = 'flex';
                setTimeout(() => document.getElementById('customHeightInput').focus(), 100);
            } else {
                customBox.style.display = 'none';
            }
        });
    }

    // 1. OPEN BUTTON: Fetch Image (Base64) & Setup Canvas
    document.getElementById('openCalibBtn').addEventListener('click', async () => {
        calibModal.style.display = 'flex'; // Show modal first so dimensions calculate
        calibImg.style.opacity = 0.3; 

        try {
            const res = await fetch(`/api/device/${CURRENT_DEVICE_ID}/snapshot`);
            const data = await res.json();

            if (data.status === 'success' && data.imageBase64) {
                calibImg.src = `data:image/jpeg;base64,${data.imageBase64}`;
                calibImg.style.opacity = 1;
                
                // IMPORTANT: Wait for render, then resize canvas
                calibImg.onload = () => {
                    requestAnimationFrame(resizeCanvas);
                };
            } else {
                alert("Error: " + (data.error || "No image received"));
                calibModal.style.display = 'none';
            }
        } catch (e) {
            console.error(e);
            alert("Network Error");
            calibModal.style.display = 'none';
        }
    });

    document.getElementById('closeCalibBtn').addEventListener('click', () => {
        calibModal.style.display = 'none';
    });

    // Ensure canvas resizes if window changes
    window.addEventListener('resize', resizeCanvas);

    // --- MOUSE EVENTS ---
    calibCanvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const rect = calibCanvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
    });

    calibCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const rect = calibCanvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        // Clear and Draw Box
        ctx.clearRect(0, 0, calibCanvas.width, calibCanvas.height);
        ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
    });

    calibCanvas.addEventListener('mouseup', (e) => {
        isDrawing = false;
        const rect = calibCanvas.getBoundingClientRect();
        endX = e.clientX - rect.left;
        endY = e.clientY - rect.top;
    });

    // --- CALCULATE BUTTON ---
    document.getElementById('runCalibBtn').addEventListener('click', async () => {
        if (startX === undefined || endX === undefined) {
            showToast("Please draw a box first.", true);
            return;
        }

        let realHeight = objSelect.value;
        if (realHeight === 'custom') {
            const customInput = document.getElementById('customHeightInput');
            realHeight = customInput.value;
            if (!realHeight || realHeight <= 0) return;
        }

        // Calculate Scale Factor (Natural Size vs Display Size)
        const scaleX = calibImg.naturalWidth / calibImg.clientWidth;
        const scaleY = calibImg.naturalHeight / calibImg.clientHeight;

        const payload = {
            coords: [
                Math.round(Math.min(startX, endX) * scaleX), 
                Math.round(Math.min(startY, endY) * scaleY), 
                Math.round(Math.max(startX, endX) * scaleX), 
                Math.round(Math.max(startY, endY) * scaleY)
            ],
            height: parseFloat(realHeight),
            method: 'box'
        };

        showToast("Calculating...", false);

        try {
            const res = await fetch(`/api/device/${CURRENT_DEVICE_ID}/calibrate`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                document.getElementById('calibrationInput').value = data.value;
                document.getElementById('calibrationDisplay').value = data.value;
                showToast(`Saved: ${data.value}`, false);
                setTimeout(() => { calibModal.style.display = 'none'; }, 1500);
            } else {
                showToast("Error: " + data.error, true);
            }
        } catch (e) { console.error(e); }
    });
}