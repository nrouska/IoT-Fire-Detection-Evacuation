import json
import requests

# Configuration
CB_URL = "http://150.140.186.118:1026/v2/entities" # Standard Orion URL
SERVICE_PATH = "/2025_team2"        


# Data for your 4 sensors
sensors = [
    {"id": "parking_sensor:cicicom-s-lg3t:5", "lat": 38.287603, "lng": 21.787815},
   
]

def patch_sensor_locations():
    # FIWARE Specific Headers
    headers = {
        'Content-Type': 'application/json',
        'Fiware-ServicePath': SERVICE_PATH
    }

    for sensor in sensors:
        # FIWARE uses a specific 'attr': { 'value': x, 'type': y } structure
        payload = {
            "location": {
                "type": "geo:json",
                "value": {
                    "type": "Point",
                    "coordinates": [sensor["lng"], sensor["lat"]] # GeoJSON is [lng, lat]
                }
            }
        }
        
        # Patching specific attributes of an entity
        url = f"{CB_URL}/{sensor['id']}/attrs"
        
        try:
            # We use POST to update attributes in Orion v2, or PATCH in some LD versions
            response = requests.post(url, headers=headers, data=json.dumps(payload))
            
            if response.status_code == 204:
                print(f"✅ Successfully updated {sensor['id']}")
            else:
                print(f"❌ Error {sensor['id']}: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"⚠️ Failed to connect: {e}")

if __name__ == "__main__":
    patch_sensor_locations()