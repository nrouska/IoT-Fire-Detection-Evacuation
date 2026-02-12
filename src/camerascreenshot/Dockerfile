# Use official Python image
FROM python:3.11-slim

# Install system dependencies (FFmpeg + build tools)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy project files
COPY . /app

# Install Python dependencies
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    requests \
    ffmpeg-python

# Expose FastAPI port
EXPOSE 8000

ENV ORION_URL="http://150.140.186.118:1026/v2/entities" \
    FIWARE_SERVICE="iot" \
    FIWARE_SERVICE_PATH="/2025_team2"


# Run the FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]