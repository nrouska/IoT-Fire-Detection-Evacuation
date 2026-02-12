import fetch from 'node-fetch';
import { captureImage } from './cameraService.js';

const tempDeviceStore = [];
const ORION_URL = 'http://150.140.186.118:1026';
const SERVICE_PATH = '/2025_team2';

function cleanDeviceName(originalName) {
    if (!originalName) return "";
    return originalName
        .replace(/^urn:ngsi-ld:CrowdFlowObserved:/i, '') 
        .replace(/^urn:ngsi-ld:ParkingSpot:/i, '') 
        .replace(/^urn:ngsi-ld:Camera:/i, '')
        .replace(/^urn:ngsi-ld:/i, '');                  
}


function determineDeviceType(entity) {
    if (entity.deviceType?.value) return entity.deviceType.value; 
    
    // Check FIWARE Types
    if (entity.type === 'Camera') return 'Camera';
    if (entity.type === 'ParkingSpot') return 'Parking';
    
    // Check Attributes
    if (entity.rtspUrl) return 'Camera';
    if (entity.peopleCountAway || entity.peopleCountTowards) return 'Radar';
    if (entity.status) return 'Parking';


    return 'Unknown'; 
}

async function createFiwareEntity(data) {
    const { id, name, type, info } = data;
    const cleanId = name.replace(/\s+/g, '_'); 
    
    let payload = {};
    let entityId = "";

    // 1. Construct Payload
    if (type === 'Camera') {
        const encodedInfo = info ? encodeURIComponent(info) : "";
        entityId = `urn:ngsi-ld:Camera:${cleanId}`;
        payload = {
            "id": entityId,
            "type": "Camera",
            "name": { "type": "Text", "value": name },
            "rtspUrl": { "type": "Text", "value": encodedInfo || "" }, 
            "location": { "type": "geo:json", "value": { "type": "Point", "coordinates": [0, 0] } },
            "cameraHeight": { "type": "Number", "value": 3.0 },
            "rotationAngle": { "type": "Number", "value": 0 },
            "fieldOfView": { "type": "Number", "value": 60 },
            "calibrationConstant": { "type": "Number", "value": 0 }
        };
    }
    else if (type === 'Radar') {
        entityId = `urn:ngsi-ld:CrowdFlowObserved:${cleanId}`;
        payload = {
            "id": entityId,
            "type": "CrowdFlowObserved",
            "deviceType": { "type": "Text", "value": "Radar" },
            "name": { "type": "Text", "value": name },
            "description": { "type": "Text", "value": info || "MQTT Radar" },
            "peopleCount": { "type": "Number", "value": 0 },
            "peopleCountAway": { "type": "Number", "value": 0 },
            "peopleCountTowards": { "type": "Number", "value": 0 },
            "dateObserved": { "type": "DateTime", "value": new Date().toISOString() },
            "location": { "type": "geo:json", "value": { "type": "Point", "coordinates": [0, 0] } }
        };
    }
    else if (type === 'AccessPoint') {
        entityId = `urn:ngsi-ld:CrowdFlowObserved:${cleanId}`;
        payload = {
            "id": entityId,
            "type": "CrowdFlowObserved",
            "deviceType": { "type": "Text", "value": "AccessPoint" },
            "name": { "type": "Text", "value": name },
            "description": { "type": "Text", "value": info || "WiFi AP" },
            "peopleCount": { "type": "Number", "value": 0 },
            "dateObserved": { "type": "DateTime", "value": new Date().toISOString() },
            "location": { "type": "geo:json", "value": { "type": "Point", "coordinates": [0, 0] } }
        };
    }
    else if (type === 'ParkingSensor' || type === 'Parking') {
        entityId = `urn:ngsi-ld:ParkingSpot:${cleanId}`;
        payload = {
            "id": entityId,
            "type": "ParkingSpot",
            "name": { "type": "Text", "value": name },
            "status": { "type": "Text", "value": "free" },
            "category": { "type": "List", "value": ["sensor"] },
            "location": { "type": "geo:json", "value": { "type": "Point", "coordinates": [0, 0] } },
            "dateObserved": { "type": "DateTime", "value": new Date().toISOString() }
        };
    }
    

    // 2. Send to FIWARE
    try {
        console.log(`[DeviceService] Creating Entity: ${entityId}`);
        const res = await fetch(`${ORION_URL}/v2/entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Fiware-ServicePath': SERVICE_PATH },
            body: JSON.stringify(payload)
        });

        if (res.status === 201) {
            console.log(`[DeviceService] Created ${entityId}`);
            return { success: true, id: entityId };
        } else if (res.status === 422) {
            console.log(`[DeviceService] Entity ${entityId} already exists. Linking.`);
            return { success: true, id: entityId };
        } else {
            const txt = await res.text();
            console.error(`[DeviceService] Failed to create: ${txt}`);
            return { success: false, error: txt };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
}


export async function registerDevice(data) {
    const { id, name, type, info } = data;

    // 1. Local Check
    const exists = tempDeviceStore.find(d => d.name === name || d.id === id);
    if (exists) return { error: "Device name already exists locally." };

    const fiwareResult = await createFiwareEntity(data);
    
    if (!fiwareResult.success) {
        return { error: "Failed to save to Cloud: " + fiwareResult.error };
    }

    // 3. Local Store (Using real ID)
    const device = {
        id: fiwareResult.id, 
        name: name,
        type: type, 
        info: info || "",
        status: "Active", 
        config: {} 
    };
    tempDeviceStore.push(device);
    
    return { status: "success", device };
}

async function updateOrionAttributes(deviceId, attributes, type) {
    let fiwareType = 'CrowdFlowObserved';
    if (type === 'Camera') fiwareType = 'Camera';
    if (type === 'Parking' || type === 'ParkingSensor') fiwareType = 'ParkingSpot';

    const entitiesPayload = [{
        id: deviceId,
        type: fiwareType,
        ...attributes
    }];

    const payload = {
        "actionType": "append",
        "entities": entitiesPayload
    };
    
    try {
        console.log(`[DeviceService] Syncing attributes for ${deviceId}...`);
        await fetch(`${ORION_URL}/v2/op/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Fiware-ServicePath': SERVICE_PATH },
            body: JSON.stringify(payload)
        });
        console.log(`[DeviceService] Saved Successfully!`);
    } catch (err) {
        console.error("[DeviceService] Network Error:", err.message);
    }
}

export async function saveTopology(deviceId, config) {
    let device = tempDeviceStore.find(d => d.id === deviceId);
    
    if (!device) {
        let inferredType = 'Unknown';
        const idLower = deviceId.toLowerCase();
        if (idLower.includes('camera')) inferredType = 'Camera';
        else if (idLower.includes('wifi') || idLower.includes('ap')) inferredType = 'AccessPoint';
        else if (idLower.includes('radar')) inferredType = 'Radar';
        else if (idLower.includes('parking')) inferredType = 'Parking';

        device = {
            id: deviceId,
            name: cleanDeviceName(deviceId),
            type: inferredType,
            info: 'Fiware Device',
            status: 'Active',
            config: {}
        };
        tempDeviceStore.push(device);
    }

    device.config = { ...device.config, ...config }; 
    device.status = "Active";
    
    // Prepare Attributes
    // Prepare Attributes
    const attributesToSave = {};

    if (config.lat && config.lng) {
        attributesToSave.location = {
            type: "geo:json",
            value: { type: "Point", coordinates: [parseFloat(config.lng), parseFloat(config.lat)] }
        };
    }
    if (config.connectedTo) {
        attributesToSave.refBuilding = { type: "Relationship", value: config.connectedTo };
    }
    
    if (device.type === 'Camera') {
        if (config.info) attributesToSave.rtspUrl = { type: "Text", value: encodeURIComponent(config.info) };
        if (config.camHeight) attributesToSave.cameraHeight = { type: "Number", value: parseFloat(config.camHeight) };
        if (config.angle) attributesToSave.rotationAngle = { type: "Number", value: parseFloat(config.angle) };
        if (config.fov) attributesToSave.fieldOfView = { type: "Number", value: parseFloat(config.fov) };
        if (config.calibrationC) attributesToSave.calibrationConstant = { type: "Number", value: parseFloat(config.calibrationC) };
    }

    if (Object.keys(attributesToSave).length > 0) {
        await updateOrionAttributes(deviceId, attributesToSave, device.type);
    }

    return { status: "success" };
}

export async function fetchDevicesFromOrion() {
    try {
        const types = "CrowdFlowObserved,Camera,ParkingSpot,OffStreetParking";
        const res = await fetch(`${ORION_URL}/v2/entities?type=${types}&limit=1000`, {
            headers: { 'Fiware-ServicePath': SERVICE_PATH }
        });

        if (!res.ok) throw new Error(`Orion status: ${res.status}`);
        const entities = await res.json();

        return entities.map(entity => {
            const determinedType = determineDeviceType(entity); 
            
            let infoVal = "";
            let extraConfig = {}; 
            // Extract Info & Config based on type
            if (determinedType === 'Camera') {
                const rawRtsp = entity.rtspUrl?.value;
                if (rawRtsp) {
                    try {
                        infoVal = decodeURIComponent(rawRtsp);
                    } catch {
                        infoVal = rawRtsp; // fallback if not encoded
                    }
                }
                extraConfig = {
                    camHeight: entity.cameraHeight?.value || 3.0,
                    angle: entity.rotationAngle?.value || 0,
                    fov: entity.fieldOfView?.value || 60,
                    calibrationC: entity.calibrationConstant?.value || 0
                };
            } 
            else if (determinedType === 'Parking') {
                infoVal = entity.status?.value; 
            } 
            else {
                // Sensors/APs
                infoVal = entity.description?.value;
                extraConfig = {
                    connectedTo: entity.refBuilding?.value || null
                };
            }
            // Extract Location
            let lat = null, lng = null;
            if (entity.location?.value) {
                const val = entity.location.value;
                if (typeof val === 'object' && val.type === 'Point' && Array.isArray(val.coordinates)) {
                    lng = val.coordinates[0];
                    lat = val.coordinates[1];
                } else if (typeof val === 'string' && val.includes(',')) {
                    const parts = val.split(',');
                    lat = parseFloat(parts[0]);
                    lng = parseFloat(parts[1]);
                }
            }
            
           return {
                id: entity.id,       
                name: cleanDeviceName(entity.name?.value || entity.id),   
                type: determinedType,
                info: infoVal || "", 
                peopleCount: entity.peopleCount?.value ?? 0, 
                config: {
                    ...(lat && lng ? { lat, lng } : {}),
                    ...extraConfig 
                }
            };
        });

    } catch (err) {
        console.error("Failed to fetch from Orion:", err.message);
        return [];
    }
}

export async function getAllDevices() {
    const fiwareDevices = await fetchDevicesFromOrion();
    
    fiwareDevices.forEach(fDevice => {
        const localMatch = tempDeviceStore.find(d => d.id === fDevice.id);

        if (localMatch) {
            localMatch.peopleCount = fDevice.peopleCount;
            localMatch.type = fDevice.type; 
            if (fDevice.info) localMatch.info = fDevice.info; 

            if (!localMatch.config.lat && fDevice.config.lat) {
                localMatch.config = { ...localMatch.config, ...fDevice.config };
                localMatch.status = "Active";
            }
        } else {
            tempDeviceStore.push({
                ...fDevice,
                status: fDevice.config.lat ? "Active" : "Detected (No Location)"
            });
        }
    });

    return tempDeviceStore;
}