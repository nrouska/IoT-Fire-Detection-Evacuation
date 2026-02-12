import paho.mqtt.client as mqtt_client
import random
import time
import json
import datetime
import uuid
import base64

broker = '150.140.186.118'  
port = 1883
topic = "json/Parking/cicicom-s-lg3t"

devices = []
clients = []

def devices_conf(num_devices):
    for i in range(1, num_devices + 1):
        
        device = {
            "deviceName": f"cicicom-s-lg3t:{i}",
            "devEui": f"0004a30b00e9{i:04x}",    # unique devEui
            "devAddr": f"00d4e0{i:04x}",         # unique devAddr
            "fCnt": 0                            # frame counter per device (increments message)
        }
        devices.append(device)


def connect_mqtt():
    """Establishes connection to the MQTT broker."""
    for device in devices:
        client_id = f"device-{device['devEui']}"
        client = mqtt_client.Client(client_id)
        client.connect(broker, port)
        client.loop_start()
        clients.append(client)
        print(f"{device['deviceName']} connected!")
    return clients

def fake_data(device):
    """
    Generates fake sensor data, formats it as JSON
    """
    device["fCnt"]+=1
    now = datetime.datetime.utcnow().isoformat()
   
    temp= random.randint(0.0, 28.0)
    status = random.randint(0, 1)
    batteryVoltage = round(random.uniform(3.2, 3.4), 2)
    tag = f"V{random.randint(2,3)}.{random.randint(0,9)}.{random.randint(0,9)}"

    payload_bytes = f"{temp},{status},{tag}".encode()

    payload = {
        'deduplicationId': str(uuid.uuid4()),
        'time': now,
        "deviceInfo": {
            "tenantId": "063a0ecb-e8c2-4a13-975a-93d791e8d40c",
            "tenantName": "Smart Campus",
            "applicationId": "f3b95a1b-d510-4ff3-9d8c-455c59139e0b",
            "applicationName": "Parking",
            "deviceProfileId": "1f6e3708-6d76-4e0f-a5cb-30d27bc78158",
            "deviceProfileName":  "Cicicom S-LG3T",

            "deviceName":device["deviceName"],
            "devEui":device["devEui"],
            "tags": {
                "apiKey": "4jggokgpesnvfb2uv1s40d73ov",
                "manufacturer": "Cicicom",
                "model": "S_LG3T",
                "deviceId": device["deviceName"]
            }
        },

        "devAddr": device["devAddr"],
        "adr": True,
        "dr": 5,
        "fCnt": device["fCnt"],
        "fPort": 1,
        "confirmed": True,
        "data" : base64.b64encode(payload_bytes).decode(),

         "object": {
            "tag": tag,
            "temperature": temp,
            "carStatus": status,
            "batteryVoltage": batteryVoltage
        },

        "rxInfo": [{
            "gatewayId": "1dee04170f93c058",
            "uplinkId": random.randint(10000, 50000),
            "rssi": random.randint(-110, -50),
            "snr": round(random.uniform(-10, 5), 1),
            "channel": 6,
            ## gateway location
            "location": {
                "latitude": 38.288403977154466,
                "longitude": 21.788731921156614
            },
            "context": "kKDdlA==",
            "metadata": {
                "region_config_id": "eu868",
                "region_common_name": "EU868"
            },
            "crcStatus": "CRC_OK"
        }],

         "txInfo": {
            "frequency": 867500000,
            "modulation": {
                "lora": {
                    "bandwidth": 125000,
                    "spreadingFactor": 12,
                    "codeRate": "CR_4_5"
                }
            }
        }
    }

    return payload

def publish ():
    try:
        while True:
            for i, device in enumerate(devices):
                payload = fake_data(device)
                data = json.dumps(payload)
                client = clients[i]
                client.publish(topic, data)
                print(f"{device['deviceName']} sent message {data}")
            time.sleep(600)  
    except KeyboardInterrupt:
        print("Simulation stopped by user.")
    finally:
        for client in clients:
            client.loop_stop()
            client.disconnect()
    
def run():
   devices_conf(20)
   connect_mqtt()
   publish()

if __name__ == '__main__':
    run()