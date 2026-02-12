# Use an official Python runtime
FROM python:3.10-slim

# Set working directory inside the container
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the Python scripts into the container
COPY fake_parking_sensor_publisher.py fake_radar_publisher.py ./

# Optional: run both scripts (adjust how you want to run them)
CMD ["bash", "-c", "python fake_parking_sensor_publisher.py & python fake_radar_publisher.py"]