# Use official Node.js LTS image
FROM node:18-alpine

# Set working directory inside container
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the app files
COPY . .

# Expose app port
EXPOSE 3001

# Start the server
CMD ["node", "index.js"]
