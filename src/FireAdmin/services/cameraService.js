import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'public', 'configs');

if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

const CAMERA_SERVICE_URL = "http://camerascreenshot:8000";

// --- 1. CAPTURE IMAGE (Return Base64) ---
export async function captureImage(deviceId, streamUrl) {
    console.log(`[CameraService] Fetching image for ${deviceId} from ${CAMERA_SERVICE_URL}...`);

    try {
        const res = await fetch(`${CAMERA_SERVICE_URL}/screenshot/${deviceId}`);
        
        if (res.ok) {
            const data = await res.json();
            if (data.img) {
                console.log(`[CameraService] Image received.`);
                // Return the Base64 string directly
                return { status: "success", imageBase64: data.img };
            }
        }
        console.warn(`[CameraService] Service error: ${res.statusText}`);
        return { error: "Camera service returned no image." };

    } catch (error) {
        console.error(`[CameraService] Connection Failed: ${error.message}`);
        return { error: "Could not connect to Camera Service. Is it running?" };
    }
}

// --- 2. RUN CALIBRATION (Temp File -> Python -> Delete) ---
export async function runHeadlessCalibration(deviceId, coords, height, method) {
    // Re-fetch image for processing
    const capture = await captureImage(deviceId, "");
    
    if (capture.error || !capture.imageBase64) {
        return { error: "Could not fetch image for calibration." };
    }

    const safeName = deviceId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const configPath = path.join(CONFIG_DIR, `${safeName}_config.json`);
    const SCRIPT_PATH = path.join(PROJECT_ROOT, 'calibration.py');

    // Create a temporary file just for Python
    const tempFilePath = path.join(os.tmpdir(), `temp_calib_${safeName}.jpg`);
    fs.writeFileSync(tempFilePath, Buffer.from(capture.imageBase64, 'base64'));

    const coordString = coords.join(',');

    return new Promise((resolve) => {
        const pythonCmd = "python3"; 
        const args = [
            SCRIPT_PATH,
            '--image', tempFilePath,
            '--config', configPath,
            '--coords', coordString,
            '--height', String(height),
            '--method', method || 'box'
        ];

        console.log(`[CameraService] Running Calibration...`);
        const pythonProcess = spawn(pythonCmd, args);

        let outputData = "";
        
        pythonProcess.stdout.on('data', (d) => outputData += d.toString());
        pythonProcess.stderr.on('data', (d) => console.log(`[Python Log]: ${d}`));

        pythonProcess.on('close', (code) => {
            try { fs.unlinkSync(tempFilePath); } catch(e){}

            if (code !== 0) {
                resolve({ error: "Calibration script crashed." });
            } else {
                try {
                    const lines = outputData.trim().split('\n');
                    const lastLine = lines[lines.length - 1]; 
                    const result = JSON.parse(lastLine);
                    resolve({ status: "success", value: result.calibration_c });
                } catch (e) {
                    resolve({ error: "Invalid JSON from Python." });
                }
            }
        });
    });
}