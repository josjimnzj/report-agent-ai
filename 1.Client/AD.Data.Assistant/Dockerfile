# Imagen de la maqueta para Render (o cualquier host de contenedores): build de Vite + nginx sin root.

# 1) Build
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# En el contenedor la app vive en la raíz del dominio (en AD.Web va bajo /v5.81/Views/DataAssistant/).
ENV VITE_APP_BASE=/
RUN npm test && npm run build

# 2) Servir estáticos
FROM nginxinc/nginx-unprivileged:1.27-alpine
# Render inyecta PORT (10000 por defecto); en local se usa 8080.
ENV PORT=8080
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
