import time
import random
import json
from influxdb_client import InfluxDBClient, Point, WritePrecision
import paho.mqtt.client as mqtt

# InfluxDB config
influxdb_url = "http://150.140.186.118:8086"
bucket = "2025_team2"
org = "students"
token = "n_cHj0ESbn_TxoAlxVAEzU-p1yLBG6RSUJ3IZS60jsYw2R9nhFJWNUnMZjZzzEoONFMGJizS7b4rDX2RMmmsIw=="

# Create InfluxDB client
client = InfluxDBClient(url=influxdb_url, token=token, org=org)
write_api = client.write_api()

# MQTT config
broker = '150.140.186.118'
port = 1883
client_id = 'rand_id' + str(random.random())
topic = '2025_team2/fiware/CrowdFlowObserved'

def process_entity(entity):
    """Process a single entity from Orion MQTT payload"""
    entity_id = entity.get("id")
    entity_type = entity.get("type")
    name = entity.get("name", {}).get("value")
    
    # Radar fields
    people_away = entity.get("peopleCountAway", {}).get("value")
    people_towards = entity.get("peopleCountTowards", {}).get("value")
    
    # AP fields
    people_count = entity.get("peopleCount", {}).get("value")
    
    return entity_id, name, people_away, people_towards, people_count

def on_message(client, userdata, message):
    print(f"Message received: {message.payload.decode()}")
    
    try:
        payload = json.loads(message.payload.decode())
        for entity in payload.get("data", []):
            entity_id, name, people_away, people_towards, people_count = process_entity(entity)
            
            timestamp = time.time_ns()
            
            # Write radar measurement if data exists
            if people_away is not None and people_towards is not None:
                point_radar = (
                    Point("radar")
                    .tag("entity_id", entity_id or "radar:parametric-pcr2-in:1")
                    .field("peopleAway", int(people_away))
                    .field("peopleTowards", int(people_towards))
                    .time(timestamp, WritePrecision.NS)
                )
                write_api.write(bucket=bucket, org=org, record=point_radar)
                print(f"Radar written → Away: {people_away}, Towards: {people_towards}")
            
            if people_count is not None and "radar" not in str(entity_id).lower():
                point_ap = (
                    Point("ap_crowdflow")
                    .tag("entity_id", entity_id)
                    .tag("ap_name", name if name else "unknown")
                    .field("peopleCount", int(people_count))
                    .time(timestamp, WritePrecision.NS)
                )
                write_api.write(bucket=bucket, org=org, record=point_ap)
                print(f"AP written → {entity_id}: {people_count} people")
          

    except (json.JSONDecodeError, TypeError) as e:
        print("Parsing error:", e)

def main():
    mqtt_client = mqtt.Client(client_id=client_id)
    mqtt_client.on_message = on_message
    mqtt_client.connect(broker, port)
    mqtt_client.subscribe(topic)
    mqtt_client.loop_forever()

if __name__ == "__main__":
    main()