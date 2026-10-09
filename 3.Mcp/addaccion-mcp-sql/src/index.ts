#!/usr/bin/env node

// MCP SQL Server - Production version (stdio por defecto; HTTP/SSE con MCP_TRANSPORT=http o --http)

async function runServer() {
  try {
    // Dynamic imports to support execution from any working directory
    const { handleCliArgs } = await import('./cli.js');
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    const { SqlServerConnection } = await import('./connection.js');
    const { ConnectionConfigSchema } = await import('./types.js');
    const { createToolRegistry, createMcpServer } = await import('./server.js');
    const { loadSchemaGraph } = await import('./graph/loader.js');

    // Handle CLI arguments and help
    if (!handleCliArgs()) {
      return;
    }

    // Read configuration from environment variables
    const config = {
      server: process.env.SQLSERVER_HOST || 'localhost',
      database: process.env.SQLSERVER_DATABASE,
      user: process.env.SQLSERVER_USER || '',
      password: process.env.SQLSERVER_PASSWORD || '',
      port: parseInt(process.env.SQLSERVER_PORT || '1433'),
      encrypt: process.env.SQLSERVER_ENCRYPT !== 'false',
      trustServerCertificate: process.env.SQLSERVER_TRUST_CERT !== 'false',
      connectionTimeout: parseInt(process.env.SQLSERVER_CONNECTION_TIMEOUT || '30000'),
      requestTimeout: parseInt(process.env.SQLSERVER_REQUEST_TIMEOUT || '60000'),
      maxRows: parseInt(process.env.SQLSERVER_MAX_ROWS || '1000'),
    };

    // Validate configuration
    let parsed;
    try {
      parsed = ConnectionConfigSchema.parse(config);
    } catch (error) {
      console.error('Invalid configuration:', error);
      process.exit(1);
    }

    if (!config.user || !config.password) {
      console.error('Error: SQLSERVER_USER and SQLSERVER_PASSWORD environment variables are required');
      process.exit(1);
    }

    // Don't connect immediately - defer connection until first tool use.
    // This prevents the server from failing startup if SQL Server is temporarily unavailable
    const connection = new SqlServerConnection(parsed);
    console.error(`MCP SQL Server initialized for ${config.server}:${config.port || 1433}`);
    console.error(`Database: ${config.database || 'default'}, User: ${config.user}`);

    const tools = createToolRegistry(connection, config.maxRows || 1000, loadSchemaGraph());

    const useHttp = (process.env.MCP_TRANSPORT || '').toLowerCase() === 'http' || process.argv.includes('--http');
    let closeHttp: (() => Promise<void>) | undefined;

    const shutdown = async () => {
      try {
        if (closeHttp) await closeHttp();
        await connection.disconnect();
      } finally {
        process.exit(0);
      }
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    if (useHttp) {
      const { createApiKeyAuth } = await import('./auth.js');
      const { startHttpServer } = await import('./http.js');
      const authDisabled = (process.env.MCP_AUTH_DISABLED || '').toLowerCase() === 'true';
      if (authDisabled) {
        console.error('WARNING: MCP_AUTH_DISABLED=true - HTTP endpoints are NOT authenticated (local development only)');
      } else if (!process.env.MCP_API_KEY) {
        console.error('WARNING: MCP_API_KEY is not set - every MCP request will be rejected with 503');
      }
      const port = parseInt(process.env.MCP_HTTP_PORT || process.env.PORT || '3000');
      const host = process.env.MCP_HTTP_HOST || '0.0.0.0';
      const http = await startHttpServer({
        port,
        host,
        auth: createApiKeyAuth({
          apiKey: process.env.MCP_API_KEY,
          disabled: authDisabled,
          trustProxy: (process.env.MCP_TRUST_PROXY || '').toLowerCase() === 'true',
        }),
        createServer: () => createMcpServer(tools),
      });
      closeHttp = http.close;
      console.error(`MCP SQL Server listening on http://${host}:${port} (SSE: /sse + /messages, Streamable HTTP: /mcp)`);
    } else {
      const server = createMcpServer(tools);
      await server.connect(new StdioServerTransport());
      console.error('MCP SQL Server running on stdio');
    }
  } catch (error) {
    console.error('Failed to start MCP server:', (error as Error).message);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
