import traci
import sumolib
from flask import Flask, render_template
from flask_socketio import SocketIO
import requests
from math import radians, cos, sin, sqrt,atan2


app = Flask(__name__)
# Το cors_allowed_origins="*" επιτρέπει την επικοινωνία με το frontend
socketio = SocketIO(app, cors_allowed_origins="*")

# Φόρτωση δικτύου
net = sumolib.net.readNet("map.net.xml")


# Λίστα με τα IDs των οντοτήτων που θέλετε να διαβάσετε
sensor_ids = []

# Το range(1, 5) θα σταματήσει στο 4
for i in range(1, 21):
    sensor_ids.append(f"parking_sensor:cicicom-s-lg3t:{i}")

base_url = "http://150.140.186.118:1026/v2/entities/"
start_points = []

for sensor_id in sensor_ids:
    url = f"{base_url}{sensor_id}"
    
    try:
        response = requests.get(url, headers={"Accept": "application/json","Fiware-ServicePath": "/2025_team2"})
        
        if response.status_code == 200:
            data = response.json()
            # Εξαγωγή coordinates [long, lat] και μετατροπή σε tuple
            status = data["status"]["value"]
            coords = tuple(data["location"]["value"]["coordinates"])
            
            # Προσθήκη στη λίστα αν δεν υπάρχει ήδη
            if coords not in start_points and status=="occupied":
                start_points.append(coords)
        else:
            print(f"Αδυναμία ανάκτησης για {sensor_id}. Status: {response.status_code}")
            
    except Exception as e:
        print(f"Σφάλμα σύνδεσης για την οντότητα {sensor_id}: {e}")

# Τελικό αποτέλεσμα
print("\nΤελική λίστα start_points:")
print(start_points)

def haversine(lon1, lat1, lon2, lat2):
    # Υπολογισμός απόστασης σε μέτρα μεταξύ δύο συντεταγμένων
    R = 6371000  # radius της γης σε μέτρα
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)
    a = sin(dphi/2)**2 + cos(phi1)*cos(phi2)*sin(dlambda/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))

def edges_within_radius(net, center_lon, center_lat, radius_m):
    """
    Επιστρέφει όλα τα edge IDs που έχουν τουλάχιστον ένα σημείο στο σχήμα τους
    εντός radius_m μέτρων από το center.
    """
    blocked_edges = []
    for edge in net.getEdges():
        shape = edge.getShape()  # list of (x, y) in SUMO coordinates
        for x, y in shape:
            lon, lat = net.convertXY2LonLat(x, y)
            dist = haversine(lon, lat, center_lon, center_lat)
            if dist <= radius_m:
                blocked_edges.append(edge.getID())
                break  # Δεν χρειάζεται να τσεκάρουμε τα υπόλοιπα σημεία
    return blocked_edges

def run_simulation():
    

    # Σημείο Προορισμού (κοινό για όλους )
    dest_lon, dest_lat = 21.784175,38.290329
    dx, dy = net.convertLonLat2XY(dest_lon, dest_lat)
    dest_edges = net.getNeighboringEdges(dx, dy, 100)
    dest_allowed = [v for v in dest_edges if v[0].allows("passenger")]
    dest_edge = min(dest_allowed, key=lambda v: v[1])[0].getID()

    traci.start(["sumo", "-c", "simulation.sumocfg"])

    # 2. Loop για προσθήκη των 4 οχημάτων
    for i, (lon, lat) in enumerate(start_points):
        x, y = net.convertLonLat2XY(lon, lat)
        edges = net.getNeighboringEdges(x, y, 500)
        allowed = [v for v in edges if v[0].allows("passenger")]
        # Τώρα το v[1] (η απόσταση) υπάρχει και η min δουλεύει
        nearest_tuple = min(allowed, key=lambda v: v[1])
        start_edge = nearest_tuple[0].getID()
        veh_id = f"veh_{i}"
        route_id = f"route_{i}"
        
        # Εύρεση διαδρομής
        route = traci.simulation.findRoute(start_edge, dest_edge)
        traci.route.add(route_id, list(route.edges))
        
        # Προσθήκη οχήματος
        traci.vehicle.add(vehID=veh_id, routeID=route_id, typeID="DEFAULT_VEHTYPE")



    # 4. Simulation Loop
    step = 0
    while step < 1000:
        traci.simulationStep()
        fire_edges=["1289093284","410671094#7","-168135718","761955800#0"] # Βεβαιώσου ότι είναι String ID
        blocked_roads_geometry = []
        for edge_id in dynamic_fire_edges:
            traci.edge.adaptTraveltime(edge_id, 99999)
            edge = net.getEdge(edge_id)
            # Παίρνουμε το σχήμα του δρόμου και το μετατρέπουμε σε LonLat
            shape = [net.convertXY2LonLat(p[0], p[1]) for p in edge.getShape()]
            # Αντιστροφή σε [lat, lon] για το Leaflet
            lat_lon_shape = [[p[1], p[0]] for p in shape]
            blocked_roads_geometry.append(lat_lon_shape)

        # Στέλνουμε τη γεωμετρία στο frontend
        socketio.emit('blocked_edges', {'roads': blocked_roads_geometry})

        # Εφαρμογή reroute σε όλα τα ενεργά οχήματα
        for v_id in traci.vehicle.getIDList():
            traci.vehicle.rerouteTraveltime(v_id)
        
        data = []
        for v_id in traci.vehicle.getIDList():
            x, y = traci.vehicle.getPosition(v_id)
            lon, lat = net.convertXY2LonLat(x, y)
            data.append({
                "id": v_id, 
                "lat": lat, 
                "lon": lon, 
                "angle": traci.vehicle.getAngle(v_id)
            })

        # Αποστολή στο Frontend
        socketio.emit('update_positions', data)
            
            # Αυτό αντικαθιστά το time.sleep και επιτρέπει στον server να δουλεύει
        socketio.sleep(0.05)

        step += 1

    traci.close()


@app.route('/')
def index():
    return render_template('index.html')


@socketio.on("connect")
def connection():
    
    socketio.emit('occupied_parkings', {'points': start_points})

    print("connect",start_points)

@socketio.on('new_fire')
def handle_new_fire(data):
    lat = data['lat']
    lon = data['lon']
    radius = 50  # μέτρα, μπορείς να το κάνεις δυναμικό
    print(f"New fire at: {lat}, {lon}, radius {radius}m")

    # Βρες όλες τις ακμές μέσα στην ακτίνα
    fire_edges = edges_within_radius(net, lon, lat, radius)
    print("Edges affected by fire:", fire_edges)

    # Στείλε τις ακμές στο simulation loop
    global dynamic_fire_edges
    dynamic_fire_edges = fire_edges

@socketio.on('start_simulation')
def handle_start_simulation():
    print("🚀 Λήψη σήματος: Έναρξη προσομοίωσης...")
    # Ξεκινάει την προσομοίωση σε "δεύτερο πλάνο"
    socketio.start_background_task(run_simulation)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0',port=5001, allow_unsafe_werkzeug=True)
