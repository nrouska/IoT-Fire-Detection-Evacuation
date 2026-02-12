# 1. Use Python 3.9 (Matches your local 'cp39' environment)
FROM python:3.9-slim

# 2. Set working directory
WORKDIR /app

# 3. Install system libraries
# Even with 'headless' OpenCV, these libs are often needed for minimal graphics support
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 4. Upgrade pip (Crucial for installing newer libraries like TF 2.20)
RUN pip install --upgrade pip

# 5. Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 6. Copy Assets (Models & Images)
COPY models/ ./models/
# COPY images/ ./images/

# 7. Copy the Code
COPY ai_pipeline.py .

# 8. Expose the API Port
EXPOSE 5000

# 9. Run the Server
CMD ["python", "-u", "ai_pipeline.py"]