# API AD.Data.Assistant (.NET 10) + MCP de SQL Server (addaccion-mcp-sql, Node) en un solo contenedor.
# El MCP corre como proceso hijo por stdio: no hay red entre ambos y las credenciales de SQL Server viven solo aquí.
# Contexto de build: raíz del repositorio.

# 1) MCP: se compila desde su repositorio en un commit fijo.
FROM node:22-bookworm AS mcp
ARG MCP_REPO=https://github.com/josjimnzj/addaccion-mcp-sql.git
ARG MCP_COMMIT=d0eb8b36081ba18f48b87ec84d6e5aba320f63c6
WORKDIR /opt/addaccion-mcp-sql
RUN git init -q . && git remote add origin "$MCP_REPO" \
 && git fetch -q --depth 1 origin "$MCP_COMMIT" && git checkout -q FETCH_HEAD \
 && npm ci --no-audit --no-fund && npm run build && npm prune --omit=dev && rm -rf .git src test

# 2) API
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY 2.Server/AD.Data.Assistant.Api/AD.Data.Assistant.Api.csproj AD.Data.Assistant.Api/
RUN dotnet restore AD.Data.Assistant.Api
COPY 2.Server/AD.Data.Assistant.Api/ AD.Data.Assistant.Api/
RUN dotnet publish AD.Data.Assistant.Api -c Release -o /app --no-restore

# 3) Imagen final
FROM mcr.microsoft.com/dotnet/aspnet:10.0
COPY --from=mcp /usr/local/bin/node /usr/local/bin/node
COPY --from=mcp /opt/addaccion-mcp-sql /opt/addaccion-mcp-sql
WORKDIR /app
COPY --from=build /app .
# Render inyecta PORT; en local se usa 8080.
ENV ASPNETCORE_URLS=http://+:8080 \
    SqlMcp__Command=node \
    SqlMcp__Script=/opt/addaccion-mcp-sql/dist/index.js
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "AD.Data.Assistant.Api.dll"]
