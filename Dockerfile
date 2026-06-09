FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production --registry=https://registry.npmjs.org

# Copy application code
COPY . .

# Expose port (default for Cloud Run)
EXPOSE 8080

# Environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Start the application
CMD [ "node", "server.js" ]
