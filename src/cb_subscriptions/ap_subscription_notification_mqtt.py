import requests
import json

orion_url = "http://150.140.186.118:1026/v2/subscriptions"
service_path = "/2025_team2"


subscription = {
    "description": "Notify updates for AP to MQTT",
    "subject": {
        "entities": [
            {
                "id": "urn:ngsi-ld:CrowdFlowObserved:KTIRIO_A:WiFi",
                "type": "CrowdFlowObserved"
            },
            {
                "id": "urn:ngsi-ld:CrowdFlowObserved:KTIRIO_I:WiFi",
                "type": "CrowdFlowObserved"
            },
            {
                "id": "urn:ngsi-ld:CrowdFlowObserved:KTIRIO_B:WiFi",
                "type": "CrowdFlowObserved"
            },
            {
                "id": "urn:ngsi-ld:CrowdFlowObserved:KTIRIO_TH:WiFi",
                "type": "CrowdFlowObserved"
            },
            {
                "id": "urn:ngsi-ld:CrowdFlowObserved:KTIRIO_C:WiFi",
                "type": "CrowdFlowObserved"
            },
            {
                "id": "urn:ngsi-ld:CrowdFlowObserved:R0_EST:WiFi",
                "type": "CrowdFlowObserved"
            },
            {
                "id": "urn:ngsi-ld:CrowdFlowObserved:R0_AMF:WiFi",
                "type": "CrowdFlowObserved"
            },
            {
                "id": "urn:ngsi-ld:CrowdFlowObserved:KTIRIO_H:WiFi",
                "type": "CrowdFlowObserved"
            },

            {
                "id": "urn:ngsi-ld:CrowdFlowObserved:R0_GRAFEIA:WiFi",
                "type": "CrowdFlowObserved"
            }

                    
        ],
        #which attributes enable notify
        "condition": {
            "attrs": [
                "peopleCount"
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
            "name",
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