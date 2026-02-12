import paho.mqtt.client as mqtt_client
import random
import time
import json
import datetime
import uuid
import base64

broker = '150.140.186.118'  #lab's broker 
port = 1883
topic = "json/Room monitoring/parametric-pcr2-in"

devices = []
clients = []

def devices_conf(num_devices):
    for i in range(2, num_devices + 1):
        
        device = {
            "deviceName": f"parametric-pcr2-in:{i}",
            "devEui": f"34353131523080{i:02d}",  # unique devEui
            "devAddr": f"0045B5{i:02d}",         # unique devAddr
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
    rtl = random.randint(0.0, 5.0)
    ltr = random.randint(0.0, 5.0)
    temp= random.randint(20.0, 28.0)
    rtl_sum = random.randint(30.0, 80.0)
    ltr_sum = random.randint(rtl_sum, 90.0)
    payload_bytes = f"{rtl},{ltr},{temp}".encode()

    payload = {
        'deduplicationId': str(uuid.uuid4()),
        'time': now,
        "deviceInfo": {
            "tenantId": "063a0ecb-e8c2-4a13-975a-93d791e8d40c",
            "tenantName": "Smart Campus",
            "applicationId": "0eae44c5-3984-4435-ba51-b439fd835b79",
            "applicationName": "Room monitoring",
            "deviceProfileId": "89ee6ca9-253e-4995-bd30-cd1e1286f6ff",
            "deviceProfileName": "Parametric PCR2-IN",

            "deviceName":device["deviceName"],
            "devEui":device["devEui"],
            "tags": {"deviceId": device["deviceName"]}
            },

        "devAddr": device["devAddr"],
        "adr": True,
        "dr": 5,
        "fCnt": device["fCnt"],
        "fPort": 14,
        "confirmed": True,
        "data" : base64.b64encode(payload_bytes).decode(),

         "object": {
            "RTL": rtl ,
            "RTL_SUM": rtl_sum,
            "SBX_PV": 0.0,
            "LTR": ltr ,
            "LTR_SUM": ltr_sum ,
            "DIFF": ltr_sum - rtl_sum,
            "SBX_BATT":random.randint(1.0, 4.0),
            "TEMP": temp,
            "source" : "fake"
        },

        "rxInfo": [{
            "gatewayId": "1dee04170f93c058",
            "uplinkId": random.randint(10000, 50000),
            "rssi": random.randint(-110, -50),
            "snr": round(random.uniform(-10, 5), 1),
            "channel": 5,
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
                    "spreadingFactor": 7,
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
   devices_conf(10)
   connect_mqtt()
   publish()

if __name__ == '__main__':
    run()