# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for caching
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Production serving stage
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder stage
COPY --from=builder /app/dist /var/www/openmelon

# Expose port (will be mapped in docker-compose)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
