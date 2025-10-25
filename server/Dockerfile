# Stage 1: Build the project
FROM node:18-alpine AS builder

WORKDIR /build

# Copy package files and install dependencies
COPY package*.json ./

# Use npm install when package-lock.json is not present
RUN npm install

# Copy the rest of the source code and build the project
COPY . .

RUN npm run build
RUN npm prune --omit=dev

# Stage 2: Copy only the `dist` folder
FROM node:18-alpine AS runner

WORKDIR /app

# Copy the `dist` folder from the builder stage
## Copy built output and node_modules outside /app so mounts don't hide them
COPY --from=builder /build/dist /dist/
COPY --from=builder /build/public /public/
COPY --from=builder /build/node_modules /node_modules
COPY --from=builder /build/package*.json /

# Ensure node can find binaries from /node_modules
ENV PATH=/node_modules/.bin:$PATH

# Expose the port the app uses
EXPOSE 3000

# Run the built server directly from the absolute path so a mounted /app
# (./server:/app) won't hide the built artifacts.
CMD ["node", "/dist/server.js"]