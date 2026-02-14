import requests
import json

orion_url = "http://150.140.186.118:1026/v2/subscriptions"
service_path = "/2025_team2"


subscription = {
    "description": "Notify updates for CrowdFlowObserved entity to MQTT",
    "subject": {
        "entities": [
            {
                "type": "CrowdFlowObserved",
                "idPattern": "radar:.*"
            }
        ],
        #which attributes enable notify
        "condition": {
            "attrs": [
                "peopleCount",
                "peopleCountAway",
                "peopleCountTowards",
                "peopleCountAwayTotal",
                "peopleCountTowardsTotal"
            ]
        }
    },
    "notification": {
        "mqtt": {
            "url": "mqtt://150.140.186.118:1883",
            "topic": "2025_team2/fiware/CrowdFlowObserved",
            "qos": 1
            
        },
        #which attributes included in notify payload
        "attrs": [
            "peopleCount",
            "peopleCountAway",
            "peopleCountTowards",
            "peopleCountAwayTotal",
            "peopleCountTowardsTotal",
            "dateObserved"
        ]
    }
}

headers = {
    'Content-Type': 'application/json',
    'Fiware-ServicePath': service_path
}

response = requests.post(orion_url, headers=headers, json=subscription)

print("Status code:", response.status_code)
print("Response:", response.text)