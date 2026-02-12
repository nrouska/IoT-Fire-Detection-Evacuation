import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const OSM_FILE_PATH = path.join(PROJECT_ROOT, 'map.osm');

const ORION_URL = 'http://150.140.186.118:1026';
const SERVICE_PATH = '/2025_team2';

// Cache
const mapData = {
    buildings: [], 
    exits: []      
};

let osmNodes = [];

// 1. Load OSM Nodes
function loadOsmNodes() {
    if (!fs.existsSync(OSM_FILE_PATH)) return;
    const xmlData = fs.readFileSync(OSM_FILE_PATH, 'utf-8');
    const regex = /<node\s+id="(\d+)"[^>]*?lat="([\d.-]+)"\s+lon="([\d.-]+)"/g;
    let match;
    while ((match = regex.exec(xmlData)) !== null) {
        osmNodes.push({ id: match[1], lat: parseFloat(match[2]), lng: parseFloat(match[3]) });
    }
}
loadOsmNodes();

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function findNearestConnections(lat, lng, limit = 3) {
    if (osmNodes.length === 0) return [];
    const distances = osmNodes.map(node => ({
        id: node.id,
        lat: node.lat,
        lng: node.lng,
        dist: getDistance(lat, lng, node.lat, node.lng)
    }));
    distances.sort((a, b) => a.dist - b.dist);
    return distances.slice(0, limit); 
}


async function loadMapFromOrion() {
    console.log("[MapService] Loading Map Data from Fiware...");
    
    try {
        // A. Load Buildings
        const bRes = await fetch(`${ORION_URL}/v2/entities?type=Building&limit=1000`, {
            headers: { 'Fiware-ServicePath': SERVICE_PATH }
        });
        
        if (bRes.ok) {
            const buildings = await bRes.json();
            mapData.buildings = buildings.map(parseFiwareEntity).filter(b => b); 
            console.log(`[MapService] Loaded ${mapData.buildings.length} Buildings.`);
        } else {
            console.log(`[MapService] Failed to load Buildings: ${bRes.status} ${bRes.statusText}`);
        }

        // B. Load Exits
        const eRes = await fetch(`${ORION_URL}/v2/entities?type=SafeZone&limit=1000`, {
            headers: { 'Fiware-ServicePath': SERVICE_PATH }
        });

        if (eRes.ok) {
            const exits = await eRes.json();
            mapData.exits = exits.map(parseFiwareEntity).filter(e => e);
            console.log(`[MapService] Loaded ${mapData.exits.length} Exits.`);
        }

    } catch (e) {
        console.error("[MapService] Load Error:", e.message);
    }
}

function parseFiwareEntity(entity) {
    try {
        let lat = 0, lng = 0;
        if (entity.location?.value) {
            const val = entity.location.value;
            // Handle GeoJSON Object
            if (val.coordinates && Array.isArray(val.coordinates)) {
                lng = val.coordinates[0];
                lat = val.coordinates[1];
            }
            // Handle String "lat, lng" (Fallback)
            else if (typeof val === 'string') {
                const parts = val.split(',');
                lat = parseFloat(parts[0]);
                lng = parseFloat(parts[1]);
            } 
        }
        let connectedNodes = entity.connectedNodes?.value || [];

        return {
            id: entity.id,
            name: entity.name?.value || entity.id,
            type: (entity.type === 'Building') ? 'building' : 'exit',
            lat, lng, connectedNodes
        };
    } catch (e) { return null; }
}

loadMapFromOrion(); // Run on Start



async function createBuildingInOrion(building) {
    const payload = {
        id: building.id,
        type: "Building",
        name: { type: "Text", value: building.name },
        category: { type: "Array", value: ["office"] },
        location: { 
            type: "geo:json", 
            value: { 
                type: "Point", 
                coordinates: [building.lng, building.lat] // Note: [Lng, Lat]
            } 
        },
        connectedNodes: { type: "StructuredValue", value: building.connectedNodes }
    };
    await sendToOrion(payload);
}

async function createExitInOrion(exit) {
    const payload = {
        id: exit.id,
        type: "SafeZone",
        name: { type: "Text", value: exit.name },
        category: { type: "Array", value: ["emergency-exit"] },
        location: { 
            type: "geo:json", 
            value: { 
                type: "Point", 
                coordinates: [exit.lng, exit.lat] 
            } 
        },
        connectedNodes: { type: "StructuredValue", value: exit.connectedNodes }
    };
    await sendToOrion(payload);
}

async function sendToOrion(payload) {
    try {
        console.log(`[MapService] 📡 Sending ${payload.id} to Fiware...`);
        let res = await fetch(`${ORION_URL}/v2/entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Fiware-ServicePath': SERVICE_PATH },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log(`[MapService] Created ${payload.id} successfully.`);
            return;
        }

        // Handle Exists (422)
        if (res.status === 422) {
            console.log(`[MapService] ${payload.id} exists. Updating attributes...`);
            const { id, type, ...attrs } = payload;
            const patchRes = await fetch(`${ORION_URL}/v2/entities/${id}/attrs`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Fiware-ServicePath': SERVICE_PATH },
                body: JSON.stringify(attrs)
            });
            if (!patchRes.ok) {
                const txt = await patchRes.text();
                console.error(`[MapService] Update Failed: ${txt}`);
            } else {
                console.log(`[MapService] Updated ${payload.id}.`);
            }
        } else {
            const txt = await res.text();
            console.error(`[MapService] Create Failed: ${res.status} - ${txt}`);
        }
    } catch (e) { console.error("Orion Sync Error:", e.message); }
}

async function deleteFromOrion(id) {
    try {
        await fetch(`${ORION_URL}/v2/entities/${id}`, {
            method: 'DELETE',
            headers: { 'Fiware-ServicePath': SERVICE_PATH }
        });
        console.log(`[MapService] Deleted ${id} from Fiware.`);
    } catch(e) { console.error(e); }
}

async function updateLocationInOrion(id, lat, lng, connectedNodes) {
    try {
        // FIX: Update with GeoJSON
        const payload = {
            location: { 
                type: "geo:json", 
                value: { 
                    type: "Point", 
                    coordinates: [lng, lat] 
                } 
            },
            connectedNodes: { type: "StructuredValue", value: connectedNodes }
        };

        const res = await fetch(`${ORION_URL}/v2/entities/${id}/attrs`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Fiware-ServicePath': SERVICE_PATH },
            body: JSON.stringify(payload)
        });
        
        if(res.ok) console.log(`[MapService] Updated location for ${id}`);
        else console.error(`[MapService] Update failed: ${res.statusText}`);

    } catch (e) { console.error(e); }
}

// --- PUBLIC FUNCTIONS ---
export async function getMapData() { return mapData; }

export async function addBuilding(name, lat, lng, connections = 3) {
    const id = name.replace(/\s+/g, '_').toUpperCase();
    if (mapData.buildings.find(b => b.id === id)) return { error: "Building exists" };

    const building = { id, name, type: 'building', lat, lng, connectedNodes: findNearestConnections(lat, lng, connections) };
    mapData.buildings.push(building);
    createBuildingInOrion(building);
    return { status: "success", data: building };
}

export async function addExit(name, lat, lng, connections = 1) {
    const id = name.replace(/\s+/g, '_').toUpperCase();
    if (mapData.exits.find(e => e.id === id)) return { error: "Exit exists" };

    const exit = { id, name, type: 'exit', lat, lng, connectedNodes: findNearestConnections(lat, lng, connections) };
    mapData.exits.push(exit);
    createExitInOrion(exit);
    return { status: "success", data: exit };
}

export async function deleteItem(type, id) {
    const list = (type === 'building') ? mapData.buildings : mapData.exits;
    const index = list.findIndex(i => i.id === id);
    if (index !== -1) {
        list.splice(index, 1);
        deleteFromOrion(id);
        return { status: "success" };
    }
    return { error: "Not found" };
}

export async function updateLocation(type, id, lat, lng) {
    const list = (type === 'building') ? mapData.buildings : mapData.exits;
    const item = list.find(i => i.id === id);
    if (item) {
        item.lat = lat; item.lng = lng;
        item.connectedNodes = findNearestConnections(lat, lng, (type === 'building') ? 3 : 1);
        updateLocationInOrion(item.id, lat, lng, item.connectedNodes);
        return { status: "success", data: item };
    }
    return { error: "Not found" };
}