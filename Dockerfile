# AD.Data.Assistant en un solo contenedor: front (Vue) + API .NET 10 (agente) + MCP de SQL Server (Node, proceso hijo).
# La API sirve el front desde wwwroot y expone /api y /health. Contexto de build: raíz del repositorio.

# 1) Front. Render pasa las variables de entorno del servicio como build args.
FROM node:22-bookworm-slim AS front
WORKDIR /front
COPY 1.Client/AD.Data.Assistant/package.json 1.Client/AD.Data.Assistant/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY 1.Client/AD.Data.Assistant/ ./
# api = backend real; mock = maqueta con datos en duro.
ARG VITE_DATA_MODE=api
# Vacío = misma URL que el front (las llamadas van a /api). Pon una URL si el front debe llamar a otra API.
ARG VITE_DATA_API_URL=
ARG VITE_DATA_API_KEY=
ENV VITE_APP_BASE=/ VITE_DATA_MODE=$VITE_DATA_MODE VITE_DATA_API_URL=$VITE_DATA_API_URL VITE_DATA_API_KEY=$VITE_DATA_API_KEY
RUN npm test && npm run build

# 2) MCP: copia de addaccion-mcp-sql incluida en 3.Mcp/ (el repositorio original es privado).
FROM node:22-bookworm-slim AS mcp
WORKDIR /opt/addaccion-mcp-sql
COPY 3.Mcp/addaccion-mcp-sql/package.json 3.Mcp/addaccion-mcp-sql/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY 3.Mcp/addaccion-mcp-sql/ ./
RUN npm run build && npm prune --omit=dev && rm -rf src test

# 3) API
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY 2.Server/AD.Data.Assistant.Api/AD.Data.Assistant.Api.csproj AD.Data.Assistant.Api/
RUN dotnet restore AD.Data.Assistant.Api
COPY 2.Server/AD.Data.Assistant.Api/ AD.Data.Assistant.Api/
RUN dotnet publish AD.Data.Assistant.Api -c Release -o /app --no-restore

# 4) Imagen final
FROM mcr.microsoft.com/dotnet/aspnet:10.0
COPY --from=mcp /usr/local/bin/node /usr/local/bin/node
COPY --from=mcp /opt/addaccion-mcp-sql /opt/addaccion-mcp-sql
WORKDIR /app
COPY --from=api /app .
COPY --from=front /front/dist ./wwwroot
# Render inyecta PORT; en local se usa 8080.
ENV ASPNETCORE_URLS=http://+:8080 \
    SqlMcp__Command=node \
    SqlMcp__Script=/opt/addaccion-mcp-sql/dist/index.js
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "AD.Data.Assistant.Api.dll"]
