import requests
import json

orion_url = "http://150.140.186.118:1026/v2/entities"
subscription_url = "http://150.140.186.118:1026/v2/subscriptions"
service_path ="/2025_team2"

params = {
    "type": "Camera"

}
headers = {
    "Fiware-ServicePath": service_path
}

response = requests.get(orion_url, headers=headers, params=params)
response.raise_for_status()

cameras = response.json()
camera_ids = [camera["id"] for camera in cameras]
entities =[]
for camera_id in camera_ids:
   
    safe_id = camera_id.split(":")[-1]

    entities.append({
        "id": f"urn:ngsi-ld:Alert:{safe_id}",
        "type": "Alert"
    })

subscription = {
    "description": "Notify Alert severity changes via MQTT",
    "subject": {
        "entities": entities,

        "condition": {
            "attrs": ["severity"]  # notify only when severity changes
        }
    },
    "notification": {
        "mqtt": {
            "url": "mqtt://150.140.186.118:1883",
            "topic": "2025_team2/fiware/Alert",
            "qos": 1
        },
        "attrs": ["severity", "description", "location", "dateIssued"]
    }
}

headers = {
    'Content-Type': 'application/json',
    'Fiware-ServicePath': service_path
}

response = requests.post(subscription_url, headers=headers, json=subscription)

print("Status code:", response.status_code)
print("Response:", response.text)