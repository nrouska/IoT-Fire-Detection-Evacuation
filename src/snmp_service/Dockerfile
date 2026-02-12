# 1. Use Python 3.10
FROM python:3.10-slim

# 2. Set the working directory
WORKDIR /app

# 3. Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Copy all Python scripts
COPY *.py .

# 5. Run both scripts in parallel
CMD ["sh", "-c", "python -u snmp_agent.py & python -u mqtt_to_influx_connector.py"]