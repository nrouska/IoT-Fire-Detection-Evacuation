# 1. Use 'slim' image
FROM node:18-slim

# Set working directory
WORKDIR /app

# 2. Install System Libraries
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# 3. Install Python Dependencies (CPU ONLY)
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt \
    --index-url https://download.pytorch.org/whl/cpu \
    --extra-index-url https://pypi.org/simple \
    --break-system-packages

# 4. Pre-download the AI Model
COPY preload.py ./
RUN python3 preload.py && rm preload.py

# 5. Standard Node.js Setup
COPY package*.json ./
RUN npm install --production

# 6. Copy the rest of the app
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]