import 'dotenv/config'
import pool from '../db.js';
import express from 'express';
import * as deviceService from '../services/deviceService.js';
import * as mapService from '../services/mapService.js';
import * as cameraService from '../services/cameraService.js';
import { calculateAndPushPlan } from '../services/evacuationLogic.js';
import fetch from 'node-fetch';

const router = express.Router();

let SENSOR_DATA = [];

router.get('/api/devices', async (req, res) => {
    const list = await deviceService.getAllDevices();
    res.json(list);
});

router.get('/api/device/:id/topology', async (req, res) => {
    const devices = await deviceService.getAllDevices();
    const device = devices.find(d => d.id === req.params.id);

    if (device && device.config) {
        res.json(device.config); // Returns { lat, lng, angle, fov }
    } else {
        res.json({}); // Returns empty if new
    }
});

router.post('/api/devices', async (req, res) => {
    const { id, name, type, info } = req.body;

    const result = await deviceService.registerDevice(req.body);
    if (result.error) return res.status(400).json(result);

    if (type === 'Camera') {
        await cameraService.captureImage(id, info);
    }

    res.json(result);
});

router.post('/api/device/:id/topology', async (req, res) => {
    const result = await deviceService.saveTopology(req.params.id, req.body);

    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
});

router.post('/api/device/:id/calibrate', async (req, res) => {
    const { coords, height, method } = req.body;

    const result = await cameraService.runHeadlessCalibration(req.params.id, coords, height, method);

    if (result.error) return res.status(500).json(result);
    res.json(result);
});


router.get('/topology', (req, res) => {
    res.render("topology", {
        stylesheets: ['/css/main.css', '/css/styles.css', '/leaflet/leaflet.css'],
        scripts: ['/leaflet/leaflet.js', '/topology/js/map.js'] 
    });
});

router.get('/api/map/all', async (req, res) => {
    const mapItems = await mapService.getMapData();
    const devices = await deviceService.getAllDevices(); // Shows cameras too
    res.json({ ...mapItems, devices });
});

router.post('/api/map/building', async (req, res) => {
    const { name, lat, lng, connections } = req.body; 
    
    if (!name || !lat) return res.status(400).json({error: "Missing data"});

    // Pass connections (defaulting to 3 if undefined) to the service
    const result = await mapService.addBuilding(name, lat, lng, connections || 3);

    if (result.error) {
        return res.status(400).json(result);
    }

    res.json(result);
});

router.post('/api/map/exit', async (req, res) => {
    const { name, lat, lng, connections } = req.body;
    
    if (!name || !lat) return res.status(400).json({error: "Missing data"});

    // Pass connections (defaulting to 1 if undefined)
    const result = await mapService.addExit(name, lat, lng, connections || 1);

    if (result.error) {
        return res.status(400).json(result);
    }

    res.json(result);
});

router.post('/api/fiware/notify', async (req, res) => {
    const data = req.body.data;
    if (!data) return res.sendStatus(200);

    let fireDetected = false;
    let fireLoc = null;

    data.forEach(entity => {
        // Check for Fire
        if (entity.type === 'FireAlarm' && entity.fireDetected?.value) {
            fireDetected = true;
            const coords = entity.location?.value?.coordinates;
            if (coords) fireLoc = { lat: coords[1], lng: coords[0] };
        }
        // Check for Crowds (Congestion)
        if (entity.type === 'PeopleCounter') {
            const count = entity.count?.value || 0;
            const buildingId = entity.id.replace('PeopleCounter_', '');
            const existing = SENSOR_DATA.find(s => s.id === buildingId);
            if (existing) existing.count = count;
            else SENSOR_DATA.push({ id: buildingId, count });
        }
    });

    if (fireDetected) {
        console.log("Fire Detected! Admin calculating plan...");
        calculateAndPushPlan(fireLoc);
    }

    res.sendStatus(200);
});


router.get('/api/test/simulate', async (req, res) => {
    const mockFire = { lat: 38.288, lng: 21.788 };
    await calculateAndPushPlan(mockFire);
    res.json({ message: "Simulation Sent to User Server!" });
});

router.post('/api/test/reset', async (req, res) => {
    try {
        console.log("Sending RESET command to User Server...");
        
        // Send "SAFE" status to User Server
        // Use 'host.docker.internal' if in Docker, 'localhost' if native
        await fetch('http://fireuser:3001/internal/sync-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: "NORMAL",
                fireLocation: null,
                paths: []
            })
        });

        res.json({ message: "User Server Reset to Normal." });
    } catch (e) {
        console.error("Reset Error:", e);
        res.status(500).json({ error: "Failed to reset User Server" });
    }
});

router.post('/api/notifications', async (req, res) => {
    const { message } = req.body;

    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // Close all open notifications
        await conn.query(
            'UPDATE notifications SET end_date = CURRENT_TIMESTAMP WHERE end_date IS NULL'
        );

        // Insert new notification
        await conn.query(
            'INSERT INTO notifications (text) VALUES (?)',
            [message]
        );

        await conn.commit();
        setTimeout(()=>{
            res.redirect('/notifications');
        }, 1000)
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).send('Database error');

    } finally {
        conn.release();
    }
});

router.get('/api/notifications', async (req, res) => {
    const [rows] = await pool.query(
        'SELECT text FROM notifications WHERE end_date IS NULL ORDER BY start_date DESC LIMIT 1;',
        []
    )
    res.json(rows[0])
})



// 1. The Simulation Page
router.get('/simulation', (req, res) => {
    res.render("simulation", {
        stylesheets: ['/css/main.css', '/css/styles.css', '/leaflet/leaflet.css'],
        scripts: ['/leaflet/leaflet.js', '/simulate/fireSim.js'] 
    });
});


router.post('/api/simulation/calculate', async (req, res) => {
    const { lat, lng } = req.body;
    try {
        const pyRes = await fetch('http://evacuationserver:5000/calculate-global-evacuation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fire_location: { lat, lng }
            })
        });

        const plan = await pyRes.json();

        if (plan.status === 'success') {
            
            const mapData = await mapService.getMapData();
            
            const buildingsPayload = mapData.buildings.map(b => ({
                id: b.id,      // Ensure this matches the ID Python returns (b.id or b.name)
                people: 50     // Default count for simulation visual
            }));

            res.json({ status: 'success', paths: plan.results, buildingData: buildingsPayload });
            
        } else {
            res.status(500).json({ status: 'error', message: 'Calculation failed' });
        }

    } catch (e) {
        console.error("Simulation Error:", e);
        res.status(500).json({ error: e.message });
    }
});

router.delete('/api/map/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    if (!['building', 'exit'].includes(type)) return res.status(400).json({ error: "Invalid type" });

    const result = await mapService.deleteItem(type, id);
    if (result.error) return res.status(404).json(result);
    res.json(result);
});

// --- NEW: UPDATE LOCATION ---
router.put('/api/map/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const { lat, lng } = req.body;

    if (!['building', 'exit'].includes(type)) return res.status(400).json({ error: "Invalid type" });
    if (!lat || !lng) return res.status(400).json({ error: "Missing coordinates" });

    const result = await mapService.updateLocation(type, id, lat, lng);
    if (result.error) return res.status(404).json(result);
    res.json(result);
});


router.get('/stats', (req, res) => {
    res.render("statistics", {
        // Keeps the same CSS as the main page so it looks consistent
        stylesheets: ['/css/main.css', '/css/styles.css'], 
        });
});


router.get('/api/device/:id/snapshot', async (req, res) => {
    const { id } = req.params;
    const result = await cameraService.captureImage(id, ""); 
    
    if (result.error) return res.status(500).json(result);
    res.json(result); 
});

router.get('/sumo', (req, res) => {
    res.render('sumo',{stylesheets: ['/css/main.css', '/css/styles.css']}); // Renders views/sumo.hbs
});
export default router;