import os
import ffmpeg
import requests
import base64
from fastapi import FastAPI, HTTPException
from urllib.parse import unquote

app = FastAPI()

# FIWARE Orion Context Broker details
orion_url = os.getenv("ORION_URL")
fiware_service = os.getenv("FIWARE_SERVICE")
fiware_service_path = os.getenv("FIWARE_SERVICE_PATH")
entity_query = "?type=Camera"

# Build helpers
RTSP_STREAMS = []
CAMERA_BY_ID = {}
cameras = None

def updateCameras():
    global cameras, RTSP_STREAMS, CAMERA_BY_ID

    RTSP_STREAMS = []
    CAMERA_BY_ID = {}
    cameras = None

    response = requests.get(
        orion_url + entity_query,
        headers={
            "Accept": "application/json",
            "Fiware-ServicePath": fiware_service_path
        }
    )

    cameras = response.json()
    for camera in cameras:
        rtsp = unquote(camera["rtspUrl"]["value"])
        RTSP_STREAMS.append(rtsp)
        CAMERA_BY_ID[camera["id"]] = {
            "name": camera.get("name"),
            "rtsp": rtsp,
            "location": camera.get("location"),
            "rotationAngle": camera.get("rotationAngle"),
            "calibrationConstant": camera.get("calibrationConstant")
        }

updateCameras()
print(RTSP_STREAMS)


def jpg_to_base64(path="screenshot.jpg"):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


idx = 0


@app.get("/screenshot/")
def screenshot_round_robin():
    global idx

    if not RTSP_STREAMS:
        raise HTTPException(status_code=404, detail="No cameras available")

    i = idx % len(RTSP_STREAMS)
    rtsp_url = RTSP_STREAMS[i]

    try:
        (
            ffmpeg
            .input(
                rtsp_url,
                rtsp_transport="tcp"
            )
            .output(
                "screenshot.jpg",
                vframes=1,
                vf="select=eq(pict_type\\,I),format=yuv420p",
                **{"update": 1}
            )
            .run(overwrite_output=True)
        )

        camera = cameras[i]
        idx += 1

        return {
            "id": camera["id"],
            "name": camera.get("name"),
            "img": jpg_to_base64(),
            "location": camera.get("location"),
            "rotationAngle": camera.get("rotationAngle"),
            "calibrationConstant": camera.get("calibrationConstant")
        }

    except ffmpeg.Error as e:
        idx += 1
        return {"error": e.stderr.decode()}


@app.get("/screenshot/{camera_id}")
def screenshot_by_id(camera_id: str):
    updateCameras()
    if camera_id not in CAMERA_BY_ID:
        raise HTTPException(status_code=404, detail="Camera ID not found")

    camera = CAMERA_BY_ID[camera_id]
    rtsp_url = camera["rtsp"]

    try:
        (
            ffmpeg
            .input(
                rtsp_url,
                rtsp_transport="tcp"
            )
            .output(
                "screenshot.jpg",
                vframes=1,
                vf="select=eq(pict_type\\,I),format=yuv420p",
                **{"update": 1}
            )
            .run(overwrite_output=True)
        )

        return {
            "id": camera_id,
            "name": camera["name"],
            "img": jpg_to_base64()
        }

    except ffmpeg.Error as e:
        return {"error": e.stderr.decode()}
