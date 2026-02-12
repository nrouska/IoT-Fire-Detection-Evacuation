import cv2
import torch
import numpy as np
import json
import sys
import argparse
# from ultralytics import YOLO

# --- ARGUMENTS ---
parser = argparse.ArgumentParser()
parser.add_argument('--image', type=str, required=True)
parser.add_argument('--config', type=str, required=True) # Where to save
parser.add_argument('--coords', type=str, required=True) # Format: "x1,y1,x2,y2"
parser.add_argument('--height', type=float, required=True) # Real height in meters
parser.add_argument('--method', type=str, default="box")   # "box" or "line"
args = parser.parse_args()

FOCAL_LENGTH_PX = 1200 

def run_calibration():
    # 1. LOAD IMAGE
    frame = cv2.imread(args.image)
    if frame is None:
        print(json.dumps({"error": "Image not found"}))
        sys.exit(1)

    # 2. LOAD AI (MiDaS)
    device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
    midas = torch.hub.load("intel-isl/MiDaS", "MiDaS_small")
    midas.to(device).eval()
    transform = torch.hub.load("intel-isl/MiDaS", "transforms").small_transform

    img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    with torch.no_grad():
        prediction = midas(transform(img_rgb).to(device))
        prediction = torch.nn.functional.interpolate(
            prediction.unsqueeze(1), size=frame.shape[:2], 
            mode="bicubic", align_corners=False).squeeze()
    depth_map = prediction.cpu().numpy()

    # 3. EXTRACT DEPTH FROM COORDS
    # Coords come in as string "x1,y1,x2,y2"
    c = list(map(int, args.coords.split(',')))
    
    raw_val = None
    if args.method == 'box':
        x1, x2 = sorted([c[0], c[2]])
        y1, y2 = sorted([c[1], c[3]])
        # Safety clamp
        h, w = depth_map.shape
        x1, x2 = max(0, x1), min(w, x2)
        y1, y2 = max(0, y1), min(h, y2)
        
        crop = depth_map[y1:y2, x1:x2]
        if crop.size > 0:
            raw_val = np.median(crop)
    else:
        # Line logic
        mask = np.zeros_like(depth_map, dtype=np.uint8)
        cv2.line(mask, (c[0], c[1]), (c[2], c[3]), 255, 2)
        vals = depth_map[mask == 255]
        if vals.size > 0:
            raw_val = np.median(vals)

    if raw_val is None:
        print(json.dumps({"error": "Selection empty or out of bounds"}))
        sys.exit(1)

    # 4. CALCULATE C
    px_h = abs(c[3] - c[1])
    if px_h == 0: 
        print(json.dumps({"error": "Height in pixels is 0"}))
        sys.exit(1)
        
    final_c = ((args.height * FOCAL_LENGTH_PX) / px_h) * raw_val

    # 5. SAVE RESULT
    result = {
        "calibration_c": round(float(final_c), 2),
        "method": "WEB_GUI",
        "coords": c
    }
    
    with open(args.config, 'w') as f:
        json.dump(result, f, indent=4)
        
    # Output JSON for Node.js to read
    print(json.dumps(result))

if __name__ == "__main__":
    run_calibration()