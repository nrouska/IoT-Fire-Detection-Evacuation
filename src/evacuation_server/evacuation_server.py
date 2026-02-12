from flask import Flask, request, jsonify
import networkx as nx
import osmnx as ox
import sys
import traceback
import math
import requests  # To talk to FIWARE
from shapely.geometry import Point

app = Flask(__name__)
MAP_FILE = "map.osm"
RAW_G = None        
G = None            

# --- CONFIGURATION ---
DEADLY_RADIUS = 40.0   
CAUTION_RADIUS = 90.0  
ORION_URL = "http://150.140.186.118:1026"  
FIWARE_SERVICE_PATH = "/2025_team2"       

print("[Engine] Loading Map...")
try:
    RAW_G = ox.graph_from_xml(MAP_FILE, simplify=False)
    G_proj = ox.project_graph(RAW_G)
    G = nx.DiGraph(G_proj)
    for u, v, data in G.edges(data=True):
        data.setdefault('length', 10.0)
        data.setdefault('risk_penalty', 0.0)
        data.setdefault('capacity', 100.0)
        data.setdefault('virtual_load', 0.0)
    print("[Engine] Map Ready.")
except Exception as e:
    print(f"Error loading map: {e}")
    sys.exit(1)

#
def fetch_context_from_fiware():
    headers = { "Fiware-ServicePath": FIWARE_SERVICE_PATH, "Accept": "application/json" }
    buildings_map = {} 
    safe_zones = []
    congestion_points = [] 
    
    try:
        url_b = f"{ORION_URL}/v2/entities?type=Building&options=keyValues&limit=1000"
        res_b = requests.get(url_b, headers=headers)
        if res_b.status_code == 200:
            for b in res_b.json():
                b_id = b.get('id')
                lat, lng = 0, 0
                if 'location' in b and 'coordinates' in b['location']:
                    lng, lat = b['location']['coordinates']
                
                doors = []
                if 'connectedNodes' in b:
                    nodes = b['connectedNodes']
                    if isinstance(nodes, list):
                        for n in nodes:
                            if isinstance(n, dict) and 'lat' in n: doors.append(n)
                if not doors and lat != 0: doors.append({'lat': lat, 'lng': lng})

                buildings_map[b_id] = { "id": b_id, "doors": doors, "people": 0 }

        url_s = f"{ORION_URL}/v2/entities?type=CrowdFlowObserved&options=keyValues&limit=1000"
        res_s = requests.get(url_s, headers=headers)
        if res_s.status_code == 200:
            for s in res_s.json():
                ref_building = s.get('refBuilding') 
                count = s.get('peopleCount', 0)
                
                if ref_building and ref_building in buildings_map:
                    try: buildings_map[ref_building]['people'] += int(count)
                    except: pass
                elif s.get('id') in buildings_map:
                     try: buildings_map[s.get('id')]['people'] += int(count)
                     except: pass
                
                away_val = s.get('peopleCountAway', 0)
                loc = s.get('location', {})
                coords = loc.get('coordinates')
                
                if coords and away_val > 0:
                    congestion_points.append({
                        "lat": coords[1],
                        "lng": coords[0],
                        "flow": float(away_val)
                    })

        url_e = f"{ORION_URL}/v2/entities?type=SafeZone&options=keyValues&limit=1000"
        res_e = requests.get(url_e, headers=headers)
        if res_e.status_code == 200:
            for e in res_e.json():
                if 'location' in e and 'coordinates' in e['location']:
                    lng, lat = e['location']['coordinates']
                    safe_zones.append({ 
                        "id": e.get('id'), 
                        "lat": lat, 
                        "lng": lng, 
                        "name": e.get('name') 
                    })
        
        final_buildings = list(buildings_map.values())
        for b in final_buildings:
            if b['people'] == 0: b['people'] = 50

        print(f"[FIWARE] Context: {len(final_buildings)} Buildings, {len(congestion_points)} Congestion Points")
        return final_buildings, safe_zones, congestion_points

    except Exception as e:
        print(f"[FIWARE] Fetch Error: {e}")
        return [], [], []

def get_nearest_node(lat, lng):
    return ox.distance.nearest_nodes(RAW_G, X=lng, Y=lat)

def _edge_cost(u, v, d):
    length = d.get('length', 10.0)
    risk = d.get('risk_penalty', 0.0)
    if risk >= 1e9: return float('inf')
    capacity = float(d.get('capacity', 100.0))
    load = d.get('virtual_load', 0.0)
    
    congestion_factor = 1.0 + (2.0 * (load / capacity)) 
    
    return (length * congestion_factor) + risk

def get_distance_point_to_segment(px, py, x1, y1, x2, y2):
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0: return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / (dx*dx + dy*dy)
    t = max(0, min(1, t))
    nearest_x = x1 + t * dx
    nearest_y = y1 + t * dy
    return math.hypot(px - nearest_x, py - nearest_y)

def apply_fire_risk_projected(graph, fire_lat, fire_lng):
    fire_point = Point(fire_lng, fire_lat)
    fire_point_proj, _ = ox.projection.project_geometry(fire_point, crs=RAW_G.graph['crs'], to_crs=graph.graph['crs'])
    fx, fy = fire_point_proj.x, fire_point_proj.y
    for u, v, data in graph.edges(data=True):
        u_data, v_data = graph.nodes[u], graph.nodes[v]
        dist = get_distance_point_to_segment(fx, fy, u_data['x'], u_data['y'], v_data['x'], v_data['y'])
        if dist <= DEADLY_RADIUS: data['risk_penalty'] = 1e9
        elif dist <= CAUTION_RADIUS: 
            factor = (CAUTION_RADIUS - dist) / (CAUTION_RADIUS - DEADLY_RADIUS)
            data['risk_penalty'] += 5000.0 * (factor ** 2)

def apply_realtime_congestion(graph, congestion_points):

    if not congestion_points: return

    for p in congestion_points:
        try:
            # Project Point to Graph CRS
            point_geom = Point(p['lng'], p['lat'])
            point_proj, _ = ox.projection.project_geometry(point_geom, crs=RAW_G.graph['crs'], to_crs=graph.graph['crs'])
            
            # Find Nearest Edge (u, v)
            u, v, key = ox.distance.nearest_edges(ox.project_graph(RAW_G), point_proj.x, point_proj.y)
            
            # Update the graph
            if graph.has_edge(u, v):
                # Add the flow count to the edge's load
                graph[u][v]['virtual_load'] += p['flow']
                
        except Exception as e:
            pass

@app.route('/calculate-global-evacuation', methods=['POST'])
def calculate_global_evacuation():
    try:
        data = request.json
        fire_loc = data.get('fire_location')

        if not fire_loc: return jsonify({"error": "Missing fire_location"}), 400

        buildings, safe_zones, congestion_points = fetch_context_from_fiware()
        
        if not buildings or not safe_zones:
            return jsonify({"error": "No Buildings/Exits found in FIWARE"}), 400

        temp_G = G.copy()
        apply_fire_risk_projected(temp_G, fire_loc['lat'], fire_loc['lng'])

        # 3. Apply Radar Congestion (NEW)
        apply_realtime_congestion(temp_G, congestion_points)
        
        valid_targets = []
        fire_point = Point(fire_loc['lng'], fire_loc['lat'])
        fire_proj, _ = ox.projection.project_geometry(fire_point, crs=RAW_G.graph['crs'], to_crs=G.graph['crs'])
        fx, fy = fire_proj.x, fire_proj.y

        for sz in safe_zones:
            try:
                tn = get_nearest_node(sz['lat'], sz['lng'])
                if tn in temp_G: valid_targets.append(tn)
            except: continue

        if not valid_targets: return jsonify({"status": "error", "message": "ALL EXITS BLOCKED"}), 400

        results = {}

        for b in buildings:
            doors = b.get('doors', [])
            people = b.get('people', 50)
            paths = []
            for door in doors:
                try:
                    start_node = get_nearest_node(door['lat'], door['lng'])
                    if start_node not in temp_G: continue
                    
                    best_path, best_cost = None, float('inf')
                    for target in valid_targets:
                        try:
                            path = nx.shortest_path(temp_G, start_node, target, weight=_edge_cost)
                            valid_path = True
                            cost = 0
                            for i in range(len(path)-1):
                                u, v = path[i], path[i+1]
                                ec = _edge_cost(u, v, temp_G[u][v])
                                if ec >= 1e9: 
                                    valid_path = False
                                    break
                                cost += ec
                            
                            if valid_path and cost < best_cost:
                                best_cost = cost
                                best_path = path
                        except: continue
                    
                    if best_path:
                        coords = []
                        for n in best_path:
                            nd = RAW_G.nodes[n]
                            coords.append({"lat": nd['y'], "lng": nd['x']})
                        paths.append(coords)
                        
                        for i in range(len(best_path)-1):
                            u, v = best_path[i], best_path[i+1]
                            if temp_G.has_edge(u, v):
                                temp_G[u][v]['virtual_load'] += people
                except: continue
            results[b['id']] = paths
        # print (results)
        return jsonify({"status": "success", "results": results})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)