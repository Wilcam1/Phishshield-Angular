# =========================================================
# Multi-stage Dockerfile for PhishShield Production Hosting
# Stage 1: Angular Frontend Build
# =========================================================
FROM node:20-bookworm-slim AS build-stage
WORKDIR /app

# Instalar dependencias del build
COPY package*.json ./
RUN npm ci

# Copiar código fuente y compilar bundle Angular optimizado
COPY . .
RUN npm run build

# =========================================================
# Stage 2: Production Server Runtime (Node.js + Chromium)
# =========================================================
FROM node:20-bookworm-slim AS production-stage

# Instalar Chromium del sistema y fuentes para inspección DOM y screenshots
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Variables de entorno de producción
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Instalar solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar servidor, módulos y archivos de configuración
COPY server ./server
COPY .env.example ./.env.example

# Copiar artefactos compilados del frontend Angular
COPY --from=build-stage /app/dist/phishshield-angular ./dist/phishshield-angular

# Permisos seguros con usuario no privilegiado 'node'
RUN mkdir -p /app/server/data && chown -R node:node /app

USER node

EXPOSE 3000

# Verificación de salud del contenedor
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Inicio del servidor
CMD ["node", "server/index.js"]
