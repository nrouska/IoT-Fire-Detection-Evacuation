''' ParkingSpot NGSI-v2 normalized
https://fiware-datamodels.readthedocs.io/en/stable/Parking/ParkingSpot/doc/spec/index.html'''


import random
import json
import paho.mqtt.client as mqtt
import requests


# FIWARE Orion Context Broker details
orion_url = "http://150.140.186.118:1026/v2/entities"
fiware_service_path = "/2025_team2" 
entity_type = "ParkingSpot"  

# MQTT broker details
broker = '150.140.186.118'
port = 1883
client_id = 'rand_id' + str(random.random())


def process_func(message):
    """Process the incoming message and extract data."""
    try:
        # json to python dict
        data = json.loads(message)
        obj = data.get("object", {})
        car_status_raw = obj.get("carStatus", 0)

    
        car_status = "occupied" if car_status_raw == 1 else "free"
        raw_date = data.get('time','')
        date = raw_date.split('.')[0] 
        return car_status,date
    except json.JSONDecodeError:
        print("Received message is not valid JSON.")
    except (IndexError, ValueError):
        print("Error extracting noise from measurements.")
    
    return None, None

def check_and_create_entity(entity_id,source):
    """Check if the entity exists in FIWARE, and create it if it does not."""
    headers = {
        
        'Fiware-ServicePath': fiware_service_path
    }
    # Check if the entity exists
    response = requests.get(f"{orion_url}/{entity_id}", headers=headers)
    if response.status_code == 404:
        print(f"Entity {entity_id} not found. Creating entity...")
        # Define the payload to create the entity
        payload = {
            "id": entity_id,
            "type": entity_type,
            "dateObserved": {
                "type":"DateTime",
                "value": "2026-01-08T11:31:17"
            },
            "status": {
                "type": "Text",
                "value": "free"
            },

             "source": {
                "type": "Text",
                "value": source
            }
        }
        # Send the creation request
        create_response = requests.post(orion_url, headers=headers, json=payload)
        if create_response.status_code == 201:
            print("Entity created successfully.")
        else:
            print(f"Failed to create entity: {create_response.status_code} - {create_response.text}")
    elif response.status_code == 200:
        print("Entity exists in FIWARE.")
    else:
        print(f"Error checking entity existence: {response.status_code} - {response.text}")
def ensure_source_attribute(entity_id, source):
    headers = {
        'Content-Type': 'application/json',
        'Fiware-ServicePath': fiware_service_path
    }

    payload = {
        "source": {
            "type": "Text",
            "value": source
        }
    }

    url = f"{orion_url}/{entity_id}/attrs"
    requests.post(url, headers=headers, json=payload)
def send_to_fiware(entity_id, car_status, date, source):
    check_and_create_entity(entity_id, source)
    ensure_source_attribute(entity_id, source)   # <-- ΝΕΟ

    headers = {
        'Content-Type': 'application/json',
        'Fiware-ServicePath': fiware_service_path
    }

    payload = {
        "dateObserved": {
            "type": "DateTime",
            "value": date
        },
        "status": {
            "type": "Text",
            "value": car_status
        }
    }

    url = f"{orion_url}/{entity_id}/attrs"
    response = requests.patch(url, headers=headers, json=payload)

    if response.status_code == 204:
        print(f"Updated {entity_id} ({source}) -> {car_status}")
    else:
        print(response.status_code, response.text)

def on_connect(client, userdata, flags, rc):
    """Callback function for when the client connects to the MQTT broker."""
    if rc == 0:
        print("Connected to MQTT broker successfully.")
        client.subscribe("json/Parking/cicicom-s-lg3t")
        client.subscribe("json/Parking/cicicom-s-lg3t:2")
        print(f"Subscribed to both topics")
    else:
        print(f"Failed to connect, return code {rc}")

def on_subscribe(client, userdata, mid, granted_qos):
    """Callback function for when the client subscribes to a topic."""
    print(f"Subscription successful with QoS {granted_qos}")

def on_disconnect(client, userdata, rc):
    """Callback function for handling disconnections."""
    if rc != 0:
        print("Unexpected disconnection from MQTT broker.")
    else:
        print("Disconnected from MQTT broker.")

def on_message(client, userdata, message):
    """Callback function for processing received messages."""
    data = json.loads(message.payload.decode())
    obj = data.get("object", {})
    if message.topic.endswith(":2"):
        source = "real"
    else:
        source = "fake"

    device_name = data["deviceInfo"]["deviceName"]
    entity_id = f"parking_sensor:{device_name}"

    print(f"Message received on topic {message.topic}: {message.payload.decode()}")
    status, date = process_func(message.payload.decode())
    send_to_fiware(entity_id,status, date,source)

def on_log(client, userdata, level, buf):
    """Callback function for logging MQTT client events."""
    pass
    #print(f"MQTT Log: {buf}")

def main():
    # Create an MQTT client instance
    mqtt_client = mqtt.Client(client_id=client_id)

    # Assign event callbacks for connection, disconnection, and message handling
    mqtt_client.on_connect = on_connect
    mqtt_client.on_disconnect = on_disconnect
    mqtt_client.on_message = on_message
    mqtt_client.on_subscribe = on_subscribe
    mqtt_client.on_log = on_log  # Enables detailed logging from the MQTT client


    # Connect to the MQTT broker
    print("Attempting to connect to MQTT broker...")
    mqtt_client.connect(broker, port)

    # Start the MQTT client loop
    mqtt_client.loop_forever()

if __name__ == "__main__":
    main()