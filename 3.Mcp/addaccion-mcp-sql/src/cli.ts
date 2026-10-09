#!/usr/bin/env node

import { ConnectionConfigSchema } from './types.js';

function showHelp() {
  console.log(`
MCP SQL Server - A read-only Model Context Protocol server for Microsoft SQL Server

USAGE:
  mcp-sqlserver [options]

ENVIRONMENT VARIABLES:
  SQLSERVER_HOST      SQL Server hostname (required)
  SQLSERVER_USER      Database username (required)  
  SQLSERVER_PASSWORD  Database password (required)
  SQLSERVER_DATABASE  Database name (optional, default: master)
  SQLSERVER_PORT      Port number (optional, default: 1433)
  SQLSERVER_ENCRYPT   Enable encryption (optional, default: true)
  SQLSERVER_TRUST_CERT Trust server certificate (optional, default: true)
  SQLSERVER_MAX_ROWS  Default row limit (optional, default: 1000)

  HTTP/SSE MODE (MCP_TRANSPORT=http or --http):
  MCP_API_KEY         API key required on every request (X-Api-Key or Authorization: Bearer)
  MCP_HTTP_PORT       Listen port (optional, default: PORT or 3000)
  MCP_HTTP_HOST       Listen address (optional, default: 0.0.0.0)
  MCP_TRUST_PROXY     Use X-Forwarded-For for rate limiting (optional, default: false)
  MCP_AUTH_DISABLED   Disable authentication - local development only (optional)

  SCHEMA GRAPH (schema_* tools):
  SCHEMA_GRAPH_PATH   schema-graph.json to load (optional, default: bundled AddACCION graph)
  SCHEMA_GRAPH_ENABLED Set to false to disable the schema_* tools

EXAMPLES:
  # Set environment variables and run
  export SQLSERVER_HOST="your-server.database.windows.net"
  export SQLSERVER_USER="your-username"
  export SQLSERVER_PASSWORD="your-password"
  mcp-sqlserver

  # HTTP/SSE server protected with an API key
  MCP_TRANSPORT=http MCP_API_KEY="secret" mcp-sqlserver
  # endpoints: GET /sse + POST /messages (SSE), /mcp (Streamable HTTP), GET /health

  # Using Claude Desktop (add to claude_desktop_config.json):
  {
    "mcpServers": {
      "sqlserver": {
        "command": "mcp-sqlserver",
        "env": {
          "SQLSERVER_HOST": "your-server",
          "SQLSERVER_USER": "your-username",
          "SQLSERVER_PASSWORD": "your-password"
        }
      }
    }
  }

AVAILABLE TOOLS:
  schema_overview     - Schema graph summary: domains, conventions, glossary
  schema_search       - Find tables/views by business words (es/en) + glossary
  schema_describe     - Columns and relations of a table from the graph
  schema_path         - Shortest JOIN paths between two tables
  schema_examples     - Tested SQL examples for similar questions
  schema_checks       - Run predefined read-only checks against the database
  test_connection     - Test SQL Server connection and permissions
  list_databases      - List all databases on the server
  list_tables         - List tables in a database or schema
  list_views          - List views in a database or schema
  describe_table      - Get detailed table schema
  execute_query       - Execute read-only SELECT queries (CreatedOn & co. allowed)
  get_foreign_keys    - Get foreign key relationships
  get_server_info     - Get SQL Server version and edition info
  get_table_stats     - Get table statistics and row counts

SECURITY:
  - Only read-only operations are allowed
  - SQL injection protection enabled
  - Query validation (whole-word keywords outside literals; single statement)
  - API key + brute-force limit in HTTP/SSE mode
  - Row limits and timeouts enforced

For more information, visit: https://github.com/bilims/mcp-sqlserver
`);
}

function showVersion() {
  // Read version from package.json
  console.log('2.1.0');
}

function validateEnvironment(): boolean {
  const required = ['SQLSERVER_HOST', 'SQLSERVER_USER', 'SQLSERVER_PASSWORD'];
  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(env => {
      console.error(`   ${env}`);
    });
    console.error('\n💡 Set these environment variables or see --help for examples.');
    return false;
  }

  // Validate configuration
  try {
    const config = {
      server: process.env.SQLSERVER_HOST!,
      user: process.env.SQLSERVER_USER!,
      password: process.env.SQLSERVER_PASSWORD!,
      database: process.env.SQLSERVER_DATABASE,
      port: parseInt(process.env.SQLSERVER_PORT || '1433'),
      encrypt: process.env.SQLSERVER_ENCRYPT !== 'false',
      trustServerCertificate: process.env.SQLSERVER_TRUST_CERT !== 'false',
    };

    ConnectionConfigSchema.parse(config);
    return true;
  } catch (error) {
    console.error('❌ Invalid configuration:', error);
    return false;
  }
}

export function handleCliArgs(): boolean {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return false;
  }
  
  if (args.includes('--version') || args.includes('-v')) {
    showVersion();
    return false;
  }

  if (!validateEnvironment()) {
    process.exit(1);
  }

  return true;
}