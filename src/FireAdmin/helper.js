import os from 'os';
import * as child_process from "node:child_process";
import pool from './db.js';
import bcrypt from 'bcrypt'
import * as deviceService from "./services/deviceService.js";
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export async function basicAuth(req, res, next) {
    // Αν υπάρχει ήδη session → allow
    if (req.session?.user) {
        res.locals.username = req.session.user.username;
        return next()
    }

    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"')
        return res.status(401).send('Authentication required')
    }

    const base64 = authHeader.split(' ')[1]
    const decoded = Buffer.from(base64, 'base64').toString('utf8')
    const [username, password] = decoded.split(':')

    const [rows] = await pool.query(
        'SELECT id, password_hash FROM users WHERE username = ?',
        [username]
    )

    if (!rows.length) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"')
        return res.status(401).send('Invalid credentials')
    }

    const ok = await bcrypt.compare(password, rows[0].password_hash)

    if (!ok) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"')
        return res.status(401).send('Invalid credentials')
    }

    // ✅ Save login to session
    req.session.user = {
        id: rows[0].id,
        username
    }
    res.locals.username = username;

    next()
}


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

export async function deviceInformation() {
    const deviceList = await deviceService.getAllDevices();
    const noLocation = deviceList.filter((it)=>{
        return it.status === "Detected (No Location)"
    })

    return {
        "Devices": deviceList.length,
        "Devices pending topology assignment": noLocation.length
    }
}

export function isCamera(deviceType) {
    return deviceType === "Camera";
}