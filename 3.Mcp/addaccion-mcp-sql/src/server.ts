import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SqlServerConnection } from './connection.js';
import { ErrorHandler } from './errors.js';
import { SchemaGraph } from './graph/schema-graph.js';
import {
  BaseTool,
  ListDatabasesTool,
  ListTablesTool,
  ListViewsTool,
  DescribeTableTool,
  ExecuteQueryTool,
  GetForeignKeysTool,
  GetServerInfoTool,
  GetTableStatsTool,
  TestConnectionTool,
} from './tools/index.js';
import { SCHEMA_TOOL_CLASSES } from './tools/schema-tools.js';

export const SERVER_NAME = 'mcp-sqlserver';
export const SERVER_VERSION = '2.1.0';

export type ToolRegistry = Map<string, BaseTool>;

/** Herramientas compartidas por todas las sesiones (una sola conexión/pool a SQL Server). */
export function createToolRegistry(connection: SqlServerConnection, maxRows: number, graph: SchemaGraph | null): ToolRegistry {
  const tools: ToolRegistry = new Map();
  const add = (tool: BaseTool) => tools.set(tool.getName(), tool);

  // Primero el grafo: los clientes suelen respetar el orden y las descripciones piden usarlo antes que el catálogo.
  if (graph) for (const ToolClass of SCHEMA_TOOL_CLASSES) add(new ToolClass(connection, maxRows, graph));

  for (const ToolClass of [
    TestConnectionTool,
    ListDatabasesTool,
    ListTablesTool,
    ListViewsTool,
    DescribeTableTool,
    ExecuteQueryTool,
    GetForeignKeysTool,
    GetServerInfoTool,
    GetTableStatsTool,
  ]) {
    add(new ToolClass(connection, maxRows));
  }
  return tools;
}

/** Un Server MCP por transporte (stdio o cada sesión HTTP/SSE), todos sobre el mismo registro de herramientas. */
export function createMcpServer(tools: ToolRegistry): Server {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  server.onerror = (error: Error) => {
    console.error('[MCP Error]', error);
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Array.from(tools.values()).map(tool => ({
      name: tool.getName(),
      description: tool.getDescription(),
      inputSchema: tool.getInputSchema(),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;
    const tool = tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      const result = await tool.execute(args || {});
      return {
        content: [
          {
            type: 'text',
            // Las herramientas del grafo ya devuelven JSON compacto (y truncado)
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const mcpError = ErrorHandler.handleSqlServerError(error);
      const userError = ErrorHandler.formatErrorForUser(mcpError);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: userError.error,
              code: userError.code,
              suggestions: userError.suggestions,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
