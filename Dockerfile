# syntax=docker/dockerfile:1
# --- Stage 1: build the React frontend ---
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: install backend deps and run ---
FROM node:20-alpine AS backend
WORKDIR /app

# Backend deps
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force

# Backend source
COPY backend/ ./backend/

# Built frontend from stage 1 — server.js serves ../frontend/dist relative to backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# Simple container healthcheck hitting the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||5000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Run as non-root
USER node

WORKDIR /app/backend
CMD ["node", "server.js"]
