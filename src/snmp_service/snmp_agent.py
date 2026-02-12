import re
import time
from collections import Counter
import requests
from pysnmp.hlapi import (
    SnmpEngine,
    CommunityData,
    UdpTransportTarget,
    ContextData,
    ObjectType,
    ObjectIdentity,
    bulkCmd,
)

HOST = "150.140.186.118"
PORT = 1722
COMM = "smartnetworks2024"
AP_NAME_OID = "1.3.6.1.4.1.2011.6.139.18.1.2.1.4"

ORION_URL = "http://150.140.186.118:1026/v2/entities"
FIWARE_SERVICE_PATH = "/2025_team2"

INFRASTRUCTURE_VENDORS = {
    "941700": "HP Printer/PC",
    "1CCCD6": "HP Printer/PC",
    "C8154E": "HP Printer/PC",
    "001E0B": "HP Generic",
    "3CD92B": "HP Generic",
    "000085": "Canon Printer",
    "0017C4": "Cisco IP Phone",
    "0026AB": "Epson Printer"
}

def process_oid_mac(oid_object):
    try:
        parts = str(oid_object).split('.')
        if len(parts) < 6:
            return None
        mac_decimals = parts[-6:]
        mac_hex_parts = [f"{int(x):02X}" for x in mac_decimals]
        clean_mac = "".join(mac_hex_parts)
        # Skip multicast/locally administered (heuristic on second hex char)
        if clean_mac[1] in ['2', '6', 'A', 'E']:
            return None
        oui = clean_mac[:6]
        if oui in INFRASTRUCTURE_VENDORS:
            return None
        return clean_mac
    except Exception:
        return None

def walk_column_filtered(label, base_oid):
    valid_targets = []
    for (errorIndication, errorStatus, errorIndex, varBinds) in bulkCmd(
            SnmpEngine(), CommunityData(COMM, mpModel=1),
            UdpTransportTarget((HOST, PORT), timeout=2, retries=1),
            ContextData(), 0, 100, ObjectType(ObjectIdentity(base_oid)),
            lexicographicMode=False,
    ):
        if errorIndication or errorStatus:
            print("SNMP error:", errorIndication or errorStatus)
            break
        for name, val in varBinds:
            location_name = val.prettyPrint()
            if not location_name:
                continue
            action = process_oid_mac(name)
            if action:
                valid_targets.append(location_name)
    return valid_targets

if __name__ == "__main__":
    print("⏳ Scanning Network for Active Users...")
    while True:
        ap_names = walk_column_filtered("hwWlanStaApName", AP_NAME_OID)
        print(f"✅ Scan Complete. Found {len(ap_names)} active human devices.")

        regex_pattern = r"((?:KTIRIO|R0)[_\s][A-Za-z]+)"
        location_counts = Counter()
        for ap_str in ap_names:
            match = re.search(regex_pattern, str(ap_str), re.IGNORECASE)
            if match:
                location = match.group(1).upper().replace(" ", "_")
                location_counts[location] += 1
            else:
                location_counts["UNKNOWN"] += 1

        print("\n📋 PUBLISHING FIWARE PAYLOADS (CrowdFlowObserved):")
        current_time = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        headers = {
            "Content-Type": "application/json",
            "Fiware-ServicePath": FIWARE_SERVICE_PATH

        }

        for location, count in location_counts.items():
            if location == "UNKNOWN":
                print(f"Skipping UNKNOWN (count={count})")
                continue

            entity_id = f"urn:ngsi-ld:CrowdFlowObserved:{location}:WiFi"
            payload = {
                "id": entity_id,
                "type": "CrowdFlowObserved",
                "dateObserved": {"value": current_time, "type": "DateTime"},
                "peopleCount": {"value": count, "type": "Number"},
                "name": {"value": location, "type": "Text"},
                "description": {"value": "Occupancy detected via Wi-Fi AP connections", "type": "Text"},
                "deviceType": {"value": "AccessPoint", "type": "Text"}
            }

            try:
                patch_url = f"{ORION_URL}/{entity_id}/attrs?options=upsert"
                attrs_payload = {k: v for k, v in payload.items() if k not in ("id", "type")}
                patch_resp = requests.post(patch_url, headers=headers, json=attrs_payload, timeout=6)
                if patch_resp.status_code in (200, 204):
                    print(f"Patched entity {entity_id}")
                elif patch_resp.status_code == 404:
                    create_resp = requests.post(ORION_URL, headers=headers, json=payload, timeout=6)
                    if create_resp.status_code == 201:
                        print(f"Created entity {entity_id}")
                    else:
                        print(f"Failed to create {entity_id}: {create_resp.status_code} - {create_resp.text}")
                else:
                    print(f"Failed to patch {entity_id}: {patch_resp.status_code} - {patch_resp.text}")
            except requests.RequestException as e:
                print(f"HTTP error publishing {entity_id}: {e}")
        time.sleep(60)
