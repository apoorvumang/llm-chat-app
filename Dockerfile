FROM node:20-bookworm-slim

# Install build dependencies for node-pty
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev) - needed for build and to fix rollup native bindings
RUN npm ci

# Copy source code
COPY . .

# Build Next.js app
RUN npm run build

# Remove dev dependencies after build to reduce image size
RUN npm prune --omit=dev

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the relay server (which also serves the Next.js app)
CMD ["node", "src/server/relay-server.mjs"]
