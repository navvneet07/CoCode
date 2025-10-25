# Stage 1: Build the project
FROM node:18-alpine AS builder

WORKDIR /build

# Copy package files and install dependencies
COPY package*.json .

# Use npm install when package-lock.json is not present
RUN npm install

# Copy the rest of the source code and build
COPY . .

RUN npm run build
RUN npm prune --omit=dev

# Stage 2: Serve the `dist` folder
FROM node:18-alpine AS runner

WORKDIR /app

# Copy the built frontend from the builder stage
# Copy build output and node_modules to locations outside /app so host mounts
# (like mounting ./client:/app) don't hide the built artifacts or node_modules.
COPY --from=builder /build/dist /dist/
COPY --from=builder /build/package*.json /
COPY --from=builder /build/node_modules /node_modules

# Ensure local node binaries are found
ENV PATH=/node_modules/.bin:$PATH

# Expose the port
EXPOSE 5173

# Start the server serving the absolute /dist path so a mounted /app doesn't break it
RUN npm install -g serve@14.1.2
CMD ["serve", "-s", "/dist", "-l", "5173"]