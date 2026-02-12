import express from 'express';
import {basicAuth, basicInfo, deviceInformation} from "../helper.js";
import * as deviceService from "../services/deviceService.js";
import pool from "../db.js";

const router = express.Router();

router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.setHeader('Clear-Site-Data', '"cookies", "storage"')
        res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"')
        res.redirect('/');
    })
})

router.use(basicAuth);

router.get('/', async (req, res) => {
    const bi = basicInfo();
    const di = await deviceInformation();

    res.render("root", {stylesheets: ['/css/main.css', '/css/styles.css'], scripts: ['/leaflet/leaflet.js', '/deviceTopology/js/map.js'], basicInfo: bi, deviceInformation: di});
});

router.get('/devices', async (req, res) => {
    const deviceList = await deviceService.getAllDevices();

    res.render("devices", {
        stylesheets: ['/css/main.css', './css/styles.css'],
        scripts: [],
        devices: deviceList
    });
});

router.get('/device/:id/topology', async (req, res) => {
    const devices = await deviceService.getAllDevices();
    const device = devices.find(d => d.id === req.params.id);

    if (!device) return res.send("Device not found");

    res.render("deviceTopology", {
        stylesheets: ['/css/main.css', '/deviceTopology/css/styles.css', '/leaflet/leaflet.css'],
        scripts: ['/leaflet/leaflet.js', '/deviceTopology/js/map.js'],
        deviceId: req.params.id,
        deviceType: device.type,
        calibrationC: device.config ? device.config.calibration_c : null
    });
});

router.get('/topology', (req, res) => {
    res.render("topology", {
        stylesheets: ['/css/main.css', './css/styles.css', '/leaflet/leaflet.css'],
        scripts: ['/leaflet/leaflet.js', './js/map.js']
    });
});

router.get('/notifications', async (req, res) => {
    const [rows] = await pool.query(
        'SELECT id, text, start_date, (end_date IS NULL OR end_date >= CURRENT_TIMESTAMP) AS status FROM notifications ORDER BY start_date DESC;',
        []
    )

    res.render("notifications", {
        stylesheets: ['/css/main.css', './css/styles.css'],
        scripts: [],
        notifications: rows
    });
})

router.get('/simulation', async (req, res) => {
    res.render("simulation", {stylesheets: ['/css/main.css', './css/styles.css'], scripts: [],})
})


router.get('/cameraview/:id', async (req, res) => {
    const devices = await deviceService.getAllDevices();
    const device = devices.find(d => d.id === req.params.id);

    if (!device) return res.sendStatus(404);

    res.render("video", {layout: "cameraview", videolink: `https://camerastream.fireproject.sveronis.net/${device.id.replaceAll(':','-')}/stream.m3u8`, device: device})
});

export default router;