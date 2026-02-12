import os
import cv2
import torch
import numpy as np
from ultralytics import YOLO
import time
import tensorflow as tf
import json
import datetime
import requests
from flask import Flask, request, jsonify
import base64
import math

# --- CONFIGURATION ---
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

PATHS = {
    "YOLO": "models/fire_model.pt",
    "FFIRENET": "models/mobilenetv2_fire_detection.h5",
}

PARAMS = {
    "YOLO_CONF": 0.4,
    "FFIRENET_CONF": 0.5,
    "FAKE_CALIBRATION_C": 5000.0
}

ORION_URL = "http://150.140.186.118:1026/v2/entities"
FIWARE_SERVICE_PATH = "/2025_team2"

# CAMERA_SERVICE_URL = "https://camerascreenshots.fireproject.sveronis.net/screenshot/"
CAMERA_SERVICE_URL = "https://camerascreenshots.fireproject.sveronis.net/screenshot/"

# app = Flask(__name__)

def send_to_fiware(alert_data):

    headers = {
        "Content-Type": "application/json",
        "Fiware-ServicePath": FIWARE_SERVICE_PATH
    }
    
    entity_id = alert_data["id"]

    try:
        
        patch_url = f"{ORION_URL}/{entity_id}/attrs"
        
        patch_payload = {k: v for k, v in alert_data.items() if k not in ("id", "type")}

        # print(f"Attempting to patch {entity_id}...")
        patch_resp = requests.patch(patch_url, headers=headers, json=patch_payload, timeout=5)
        
        if patch_resp.status_code in [200, 204]:
            return True
            
        elif patch_resp.status_code == 404:
            # print(f"Entity not found. Creating {entity_id}...")
            create_resp = requests.post(ORION_URL, headers=headers, json=alert_data, timeout=5)
            
            if create_resp.status_code == 201:
                # print(f"Successfully created {entity_id}")
                return True
            else:
                # print(f"Failed to create {entity_id}: {create_resp.status_code} - {create_resp.text}")
                return False

        else:
            print(f"Failed to patch {entity_id}: {patch_resp.status_code} - {patch_resp.text}")
            return False

    except requests.RequestException as e:
        print(f"Connection Failed: {e}")
        return False

def calculate_new_coords(lat, lon, distance_meters, bearing_degrees):

    R = 6378137  # Earth Radius in meters
    
    # Convert to radians
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    bearing_rad = math.radians(bearing_degrees)
    
    # Calculate offset
    dn = distance_meters * math.cos(bearing_rad)
    de = distance_meters * math.sin(bearing_rad)
    
    # Coordinate offsets in radians
    dLat = dn / R
    dLon = de / (R * math.cos(lat_rad))
    
    # New coordinates in degrees
    new_lat = lat + math.degrees(dLat)
    new_lon = lon + math.degrees(dLon)
    
    return [new_lon, new_lat] # FIWARE uses [Lng, Lat] order

class FireDetectionEngine:
    def __init__(self):
        print("Initializing AI Engine...")
        self.device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
        print(f"Hardware Acceleration: {self.device}")

        # A. Load YOLO
        try:
            self.yolo = YOLO(PATHS["YOLO"])
            self.target_classes = [0, 1] # Fire/Smoke classes
            print("YOLOv8 Loaded")
        except Exception as e:
            raise RuntimeError(f"Critical: Failed to load YOLO ({e})")

        # B. Load FFireNet (Keras)
        try:
            if not os.path.exists(PATHS["FFIRENET"]): 
                # Optional warning instead of crash if you only use YOLO
                print("Warning: FFireNet model missing") 
            else:
                self.ffirenet = tf.keras.models.load_model(PATHS["FFIRENET"])
                self.ffirenet.predict(np.zeros((1, 224, 224, 3), dtype=np.float32), verbose=0)
                print("FFireNet Loaded")
        except Exception as e:
            print(f"Warning: Failed to load FFireNet ({e})")

        # C. Load MiDaS (Depth)
        try:
            self.midas = torch.hub.load("intel-isl/MiDaS", "MiDaS_small")
            self.midas.to(self.device).eval()
            self.transforms = torch.hub.load("intel-isl/MiDaS", "transforms").small_transform
            print("MiDaS Depth Loaded")
        except Exception as e:
            print(f"Warning: Depth model failed ({e}). Distance will be null.")
            self.midas = None

        print("AI Engine Ready.\n")

    def _preprocess_ffirenet(self, crop):
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (224, 224))
        normalized = resized.astype(np.float32) / 255.0
        return np.expand_dims(normalized, axis=0)

    def _calculate_distance(self, depth_map, bbox, calib_val=1.0):
        if depth_map is None: return None
        x1, y1, x2, y2 = map(int, bbox)
        h, w = depth_map.shape
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        
        region = depth_map[y1:y2, x1:x2]
        if region.size == 0: return None
        
        median_raw = np.median(region)
        if median_raw < 0.001: return 999.9
        if calib_val < 0.1: calib_val = PARAMS["FAKE_CALIBRATION_C"] 
        return round(calib_val/ median_raw, 2)

    def _format_fiware_alert(self, source_id, is_fire, distance=None, confidence=None, fire_coords=None):
        current_time = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        safe_id = source_id.split(":")[-1] if ":" in source_id else source_id 

        if is_fire:
            safe_description = f"Fire detected at {distance}m - Confidence {confidence:.2f}"
            
            alert = {
                "id": f"urn:ngsi-ld:Alert:Fire:{safe_id}",
                "type": "Alert",
                "category": { "value": "security", "type": "Text" },
                "subCategory": { "value": "fire", "type": "Text" },
                "description": { "value": safe_description, "type": "Text" }, 
                "dateIssued": { "value": current_time, "type": "DateTime" },
                "severity": { "value": "critical", "type": "Text" },
                "validFrom": { "value": current_time, "type": "DateTime" }
            }

            if fire_coords:
                alert["location"] = {
                    "type": "geo:json",
                    "value": {
                        "type": "Point",
                        "coordinates": fire_coords # [Lng, Lat]
                    }
                }
            return alert
        else:
            return {
                "id": f"urn:ngsi-ld:Alert:Fire:{safe_id}",
                "type": "Alert",
                "category": { "value": "security", "type": "Text" },
                "subCategory": { "value": "status", "type": "Text" },
                "description": { "value": "System Normal", "type": "Text" },
                "dateIssued": { "value": current_time, "type": "DateTime" },
                "severity": { "value": "info", "type": "Text" },
                "validFrom": { "value": current_time, "type": "DateTime" }
            }

    def process_frame(self, frame, source_id="camera_stream", camera_meta=None):
        """
        Modified to accept an OpenCV frame and Camera Metadata.
        """
        # A. YOLO Detection
        results = self.yolo.predict(frame, conf=PARAMS["YOLO_CONF"], verbose=False)[0]
        candidates = [box.xyxy[0].tolist() for box in results.boxes if int(box.cls[0]) in self.target_classes]

        fire_found = False
        final_alert = None
        
        calib_val = 0
        if camera_meta:
             calib_val = float(camera_meta.get("calibrationConstant", {}).get("value", 1.0))
        
        # B. Verification Loop
        if candidates:
            depth_map = None
            h, w = frame.shape[:2]
            
            for bbox in candidates:
                x1, y1, x2, y2 = map(int, bbox)
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(w, x2), min(h, y2)
                crop = frame[y1:y2, x1:x2]
                if crop.size == 0: continue

                # FFireNet Check
                score = 0.0
                if hasattr(self, 'ffirenet'):
                    ff_input = self._preprocess_ffirenet(crop)
                    score = self.ffirenet.predict(ff_input, verbose=0)[0][0]
                else:
                    score = 0.6 # Fallback if FFireNet missing, trust YOLO

                if score > PARAMS["FFIRENET_CONF"]:
                    fire_found = True
                    
                    # Compute Depth (MiDaS) - FIXED LOGIC
                    if self.midas and depth_map is None:
                        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        input_batch = self.transforms(rgb).to(self.device)
                        with torch.no_grad():
                            prediction = self.midas(input_batch)
                            prediction = torch.nn.functional.interpolate(
                                prediction.unsqueeze(1),
                                size=frame.shape[:2],
                                mode="bicubic",
                                align_corners=False,
                            ).squeeze()
                        depth_map = prediction.cpu().numpy()

                    dist = self._calculate_distance(depth_map, bbox,calib_val)
                    
                    # Calculate Fire Coordinates using Metadata
                    fire_loc = None
                    if dist and camera_meta:
                        try:
                            # Safe extraction: check if keys exist
                            loc_val = camera_meta.get('location', {}).get('value', {})
                            if 'coordinates' in loc_val:
                                cam_lng, cam_lat = loc_val['coordinates'] # GeoJSON is [Lng, Lat]
                                
                                # Angle might be a Number or Text, handle both
                                cam_angle = 0
                                if 'rotationAngle' in camera_meta:
                                    cam_angle = float(camera_meta['rotationAngle'].get('value', 0))

                                # Calculate Fire Location
                                fire_loc = calculate_new_coords(cam_lat, cam_lng, dist, cam_angle)
                        except Exception as e:
                            print(f"Location calc failed: {e}")

                    # Create Alert with Location
                    final_alert = self._format_fiware_alert(source_id, is_fire=True, distance=dist, confidence=score, fire_coords=fire_loc)
                    break

        if not fire_found:
            final_alert = self._format_fiware_alert(source_id, is_fire=False)

        return final_alert


engine = FireDetectionEngine()

def process_camera():
    try:
        # Increase timeout in case ffmpeg or network is slow
        res = requests.get(CAMERA_SERVICE_URL, timeout=30)
        
        if res.status_code == 200:
            data = res.json()
            camera_id = data.get("id", "unknown")
            
            if "img" in data and data["img"]:
                
                
                camera_met = {
                    "location": data.get("location", {}),
                    "rotationAngle": data.get("rotationAngle", {}),
                    "calibrationConstant": data.get("calibrationConstant", {})
                }

                # Decode Image
                img_bytes = base64.b64decode(data["img"])
                np_arr = np.frombuffer(img_bytes, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

                # print(f" Analyzing {camera_id}...", end="\r")
                alert = engine.process_frame(frame, source_id=camera_id, camera_meta=camera_met)

                # if alert["severity"]["value"] == "critical":
                #     print(f"\n FIRE DETECTED in {camera_id}! Sending Alert...")
                #     # send_to_fiware(alert)
                #     # print(json.dumps(alert, indent=2)) 
                # else:
                #     pass
                
                send_to_fiware(alert)
                # print(json.dumps(alert, indent=2))
            else:
                print(f"Camera {camera_id} returned no image data.")
        else:
            print(f"Could not reach Camera Service (Status {res.status_code})")

    except Exception as e:
        print(f"Error processing camera: {e}")
        
        
def start_monitoring():

    print("AI Pipeline started")
    print(f"Connecting to Camera Service at: {CAMERA_SERVICE_URL}")
    print(f"Connecting to FIWARE at: {ORION_URL}")

    while True:
        process_camera()
        time.sleep(0.5) 

if __name__ == "__main__":
    # Wait a moment for other services (Orion/Camera) to wake up
    time.sleep(5)
    start_monitoring()