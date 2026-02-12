import mqtt from 'mqtt';
import { calculateAndPushPlan } from './evacuationLogic.js'; 

const MQTT_BROKER_URL = 'mqtt://150.140.186.118:1883';
const MQTT_TOPIC = "2025_team2/fiware/Alert";

let client = null;

export function startMqttListener() {
    console.log(`[MQTT] Connecting to Broker...`);
    client = mqtt.connect(MQTT_BROKER_URL);

    client.on('connect', () => {
        console.log("[MQTT] Connected!");
        client.subscribe(MQTT_TOPIC);
    });

    client.on('message', async (topic, message) => {
        try {
            const payload = JSON.parse(message.toString());
            
            if (payload.data && payload.data.length > 0) {
                const entity = payload.data[0];
                
                // Check Severity
                let severity = entity.severity?.value || entity.severity || 'info';

                if (severity === 'critical') {
                    console.log("\n[MQTT] CRITICAL FIRE ALERT!");

                    // Extract Location
                    const locVal = entity.location?.value || entity.location || {};
                    if (locVal.coordinates) {
                        const [lng, lat] = locVal.coordinates;
                        // console.log(`[MQTT] Fire Location: Lat ${lat}, Lng ${lng}`);
                        await calculateAndPushPlan({ lat, lng });
                    }
                }
            }
        } catch (error) {
            console.error("[MQTT] Error:", error.message);
        }
    });
}