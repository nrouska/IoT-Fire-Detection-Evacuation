# IoT-Project-Team2
Project developed by Sotiris Sveronis, Giorgos Xagorarakis, Natalia Rouska in the course of IoT 2025.
Designed and developed an end-to-end IoT system. Architecture is shown below: 
<img width="734" height="402" alt="final_architecture" src="https://github.com/user-attachments/assets/1f6918d7-22ba-4777-841f-0569f96be487" />

# Smart System 
1. Fire Detection and Location Estimation with AI models
2. Crowd Estimation in Buildngs using SNMP
3. Data from CrowdFlow radars and Parking Sensors using MQTT
4. Evacuation Path for User depending in their Location away from fire
5. Administrator Dashboard for system oversight
6. Simulation of evacuation flows with SUMO
   
# Demo Video
https://www.youtube.com/watch?v=UeLNhL4mcUU

# Tools/SW/Protocols
1. Frameworks: Express, FastAPI, Flask-SocketIO
2. AI: YOLOv8, MiDaS, TensorFlow, PyTorch, OpenCV
3. DataBases: MariaDB, InfluxDB, phpMyAdmin
4. Streaming: RTSP, HLS, FFmpeg, curl, mediamtx
5. Communication: Fiware, MQTT, SNMP, HTTP
6. Simulation/Visualization: SUMO, Grafana, Leaflet

# Deployment
1. Docker is used and the containers are in the same network
2. Hosted on a VM from Hetzner
3. Nginx is used as reverse proxy
   
https://user.fireproject.sveronis.net/
https://admin.fireproject.sveronis.net/
