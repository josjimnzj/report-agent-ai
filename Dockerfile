# Imagen de la maqueta AD.Data.Assistant para Render (o cualquier host de contenedores).
# Contexto de build: raíz del repositorio. Render usa ./Dockerfile por defecto, sin configurar nada.

# 1) Build
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY 1.Client/AD.Data.Assistant/package.json 1.Client/AD.Data.Assistant/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY 1.Client/AD.Data.Assistant/ ./
# En el contenedor la app vive en la raíz del dominio (en AD.Web va bajo /v5.81/Views/DataAssistant/).
ENV VITE_APP_BASE=/
# Render pasa las variables de entorno del servicio como build args.
# VITE_DATA_MODE=api conecta con el backend; sin valor, la maqueta con datos en duro.
ARG VITE_DATA_MODE=mock
ARG VITE_DATA_API_URL=
ARG VITE_DATA_API_KEY=
ENV VITE_DATA_MODE=$VITE_DATA_MODE VITE_DATA_API_URL=$VITE_DATA_API_URL VITE_DATA_API_KEY=$VITE_DATA_API_KEY
RUN npm test && npm run build

# 2) Servir estáticos con nginx sin root
FROM nginxinc/nginx-unprivileged:1.27-alpine
# Render inyecta PORT (10000 por defecto); en local se usa 8080.
ENV PORT=8080
COPY 1.Client/AD.Data.Assistant/deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
