# 1. Use Python 3.9 (Stable & Slim)
FROM python:3.9-slim

# 2. Set working directory
WORKDIR /app

# 3. Install SYSTEM dependencies first (Cached Layer 1)
# These rarely change. Docker will cache this step forever unless you edit it.
# - libspatialindex-dev: Required for RTree/Osmnx
# - libgdal-dev & g++: Required for Geospatial calculations
RUN apt-get update && apt-get install -y \
    libspatialindex-dev \
    libgdal-dev \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 4. Copy ONLY requirements next (Cached Layer 2)
COPY requirements.txt .

# 5. Install Python dependencies (Cached Layer 3)
# Docker will ONLY run this again if you change 'requirements.txt'.
# If you only change your python script, this step is skipped (Instant build!)
RUN pip install --no-cache-dir -r requirements.txt

# 6. Copy the Map File (Cached Layer 4)
# Since map.osm rarely changes, we copy it before the script.
COPY map.osm .

# 7. Copy your Application Code (Layer 5 - The one that changes often)
COPY evacuation_server.py .

# 8. Expose the port so other containers can see it
EXPOSE 5000

# 9. Run the server (Unbuffered output to see logs instantly)
CMD ["python", "-u", "evacuation_server.py"]