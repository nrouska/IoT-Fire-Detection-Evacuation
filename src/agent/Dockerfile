# Use an official Python runtime
FROM python:3.10-slim

# Set working directory inside the container
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the Python scripts into the container
COPY parking_mqtt_cb.py radar_mqtt_cb.py ./

# Optional: run both scripts (adjust how you want to run them)
CMD ["bash", "-c", "python parking_mqtt_cb.py & python radar_mqtt_cb.py"]