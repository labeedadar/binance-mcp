import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.all('/mcp', async (req, res) => {
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

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);

  res.on('close', async () => {
    await binanceClient.close();
  });
});


// OAuth discovery endpoint
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = `https://binance-mcp-binance-mcp-server.up.railway.app`;
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
  });
});

// Dynamic client registration
app.post('/oauth/register', (req, res) => {
  res.json({
    client_id: 'binance-mcp-client',
    client_secret: 'binance-mcp-secret',
    redirect_uris: req.body.redirect_uris || [],
  });
});

// Authorization endpoint - auto approve
app.get('/oauth/authorize', (req, res) => {
  const { redirect_uri, state, code_challenge } = req.query;
  const code = 'binance-auth-code-' + Date.now();
  res.redirect(`${redirect_uri}?code=${code}&state=${state}`);
});

// Token endpoint
app.post('/oauth/token', (req, res) => {
  res.json({
    access_token: 'binance-static-token',
    token_type: 'bearer',
    expires_in: 86400,
  });
});

app.listen(PORT, () => {
  console.log(`Binance MCP server running on port ${PORT}`);
});