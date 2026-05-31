import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const transports = {};

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  transports[transport.sessionId] = transport;

  const binanceTransport = new StdioClientTransport({
    command: 'node',
    args: ['node_modules/.bin/binance-mcp-server'],
    env: {
      ...process.env,
      BINANCE_API_KEY: process.env.BINANCE_API_KEY,
      BINANCE_API_SECRET: process.env.BINANCE_API_SECRET,
      BINANCE_TESTNET: 'false',
    },
  });

  const binanceClient = new Client({ name: 'binance-proxy', version: '1.0.0' });
  await binanceClient.connect(binanceTransport);

  const server = new McpServer({ name: 'binance-mcp', version: '1.0.0' });
  const { tools } = await binanceClient.listTools();

  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema?.properties || {}, async (params) => {
      return await binanceClient.callTool({ name: tool.name, arguments: params });
    });
  }

  await server.connect(transport);

  res.on('close', async () => {
    delete transports[transport.sessionId];
    await binanceClient.close();
  });
});

app.post('/message', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Binance MCP SSE server running on port ${PORT}`);
});