#!/bin/bash

mkdir -p /var/www/html/urn-ngsi-ld-Camera-TestCamera
mkdir -p /var/www/html/urn-ngsi-ld-Camera-FakeCamera

# Stream 1
ffmpeg \
-fflags nobuffer \
-flags low_delay \
-rtsp_transport tcp \
-i "rtsp://admin:L2571030@labserver.sense-campus.gr:7111/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif" \
-map 0:v:0 \
-c:v libx264 \
-preset veryfast \
-tune zerolatency \
-pix_fmt yuv420p \
-profile:v baseline \
-level 3.0 \
-an \
-f hls \
-hls_time 2 \
-hls_list_size 5 \
-hls_flags delete_segments \
/var/www/html/urn-ngsi-ld-Camera-TestCamera/stream.m3u8 &



# Stream 2
ffmpeg -rtsp_transport tcp \
-i "rtsp://mediamtx:8554/stream" \
-c:v libx264 \
-preset veryfast \
-profile:v main \
-level 4.0 \
-pix_fmt yuv420p \
-g 50 \
-keyint_min 50 \
-sc_threshold 0 \
-c:a aac \
-b:a 128k \
-ar 48000 \
-f hls \
-hls_time 2 \
-hls_list_size 5 \
-hls_flags delete_segments+independent_segments \
/var/www/html/urn-ngsi-ld-Camera-FakeCamera/stream.m3u8 &


# Start nginx
nginx -g "daemon off;"
