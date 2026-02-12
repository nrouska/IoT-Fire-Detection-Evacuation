import os from 'os';
import * as child_process from "node:child_process";
import axios from "axios";

function run(cmd) {
    try {
        return child_process.execSync(cmd).toString().trim();
    } catch (e) {
        console.error(e);
        return "Unavailable";
    }
}

export function basicInfo() {
    const deviceName = os.hostname();
    const firmwareVersion = run("uname -r");
    const interfaces = os.networkInterfaces();
    let macAddress = "Unavailable";
    let ipAddress = "Unavailable";
    for (const iface of Object.values(interfaces)) {
        for (const details of iface) {
            if (!details.internal && details.mac !== "00:00:00:00:00:00") {
                macAddress = details.mac;
                if (details.family === "IPv4") ipAddress = details.address;
                break;
            }
        }
        if (macAddress !== "Unavailable") break;
    }
    function formatUptime(seconds) {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${d}d ${h}h ${m}m`;
    }
    const uptime = formatUptime(os.uptime());
    return {
        "Device Name": deviceName,
        "Firmware Version": firmwareVersion,
        "MAC Address": macAddress,
        "IP Address": ipAddress,
        "Uptime": uptime
    };
}

export function deviceInformation() {
    return {
        "Devices": "0",
        "Connected Devices": "0",
        "Devices with issues": "0",
        "Devices pending topology assignment": "0",
        "Topology": "0"
    }
}

const orionUrl = process.env.ORION_URL || "http://150.140.186.118:1026/v2/entities";
const fiwareService = process.env.FIWARE_SERVICE || "iot";
const fiwareServicePath = process.env.FIWARE_SERVICE_PATH || "/2025_team2";

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
    const toRad = deg => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getBuildingId(userLoc) {
    const entityQuery = "?type=Building";

    try {
        const response = await axios.get(`${orionUrl}${entityQuery}`, {
            headers: {
                "Accept": "application/json",
                "Fiware-ServicePath": fiwareServicePath
            }
        });

        let closestId = null;
        let minDistance = Infinity;

        response.data.forEach(e => {
            if (!e.location?.value?.coordinates) return;

            const [lon, lat] = e.location.value.coordinates;

            const distance = haversineDistance(
                userLoc.latlng.lat,
                userLoc.latlng.lng,
                lat,
                lon
            );

            if (distance < minDistance) {
                minDistance = distance;
                closestId = e.id;
            }
        });

        return closestId;

    } catch (error) {
        console.error(
            "Error fetching entities:",
            error.response?.data || error.message
        );
        return null;
    }
}