#!/usr/bin/env node

/**
 * npm Proxy Server
 *
 * Proxies npm requests to Verdaccio and automatically adds Client-Authorization header
 *
 * Usage:
 *   export LICENSE_JWT="your-license-jwt"
 *   node npm-proxy.js [port] [verdaccio-url]
 *
 * Then configure npm:
 *   npm config set registry http://localhost:8873
 */

const http = require('http');
const httpProxy = require('http-proxy');

const PROXY_PORT = process.argv[2] || 8873;
const VERDACCIO_URL = process.argv[3] || 'http://localhost:4873';
const LICENSE_JWT = process.env.LICENSE_JWT;

if (!LICENSE_JWT) {
  console.error('ERROR: LICENSE_JWT environment variable is required!');
  console.error('');
  console.error('Usage:');
  console.error('  export LICENSE_JWT="your-license-jwt-token"');
  console.error('  node npm-proxy.js [port] [verdaccio-url]');
  console.error('');
  process.exit(1);
}

// Create proxy server
const proxy = httpProxy.createProxyServer({
  target: VERDACCIO_URL,
  changeOrigin: true
});

// Handle proxy errors
proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  if (!res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify({
    error: 'Proxy error',
    message: err.message
  }));
});

// Log requests
proxy.on('proxyReq', (proxyReq, req, res) => {
  // Add Client-Authorization header
  proxyReq.setHeader('Client-Authorization', `Bearer ${LICENSE_JWT}`);

  // Log request
  const hasAuth = req.headers.authorization ? '✓' : '✗';
  const hasClientAuth = 'Client-Authorization added ✓';

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log(`  Authorization: ${hasAuth}`);
  console.log(`  ${hasClientAuth}`);
});

// Create HTTP server
const server = http.createServer((req, res) => {
  proxy.web(req, res);
});

// Start server
server.listen(PROXY_PORT, () => {
  console.log('================================================================================');
  console.log('npm Proxy Server');
  console.log('================================================================================');
  console.log('');
  console.log(`Proxy listening on:     http://localhost:${PROXY_PORT}`);
  console.log(`Forwarding to:          ${VERDACCIO_URL}`);
  console.log(`License JWT:            ${LICENSE_JWT.substring(0, 30)}...`);
  console.log('');
  console.log('Setup Instructions:');
  console.log('');
  console.log('1. Set npm registry to proxy:');
  console.log(`   npm config set registry http://localhost:${PROXY_PORT}`);
  console.log('');
  console.log('2. Login to Verdaccio (to get npmrc JWT):');
  console.log(`   npm login --registry http://localhost:${PROXY_PORT}`);
  console.log('');
  console.log('3. Install packages normally:');
  console.log('   npm install @gmpm/switch-sdk');
  console.log('');
  console.log('The proxy will automatically add your license JWT to all requests!');
  console.log('');
  console.log('================================================================================');
  console.log('');
  console.log('Waiting for requests...');
  console.log('');
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('');
  console.log('Shutting down proxy server...');
  server.close(() => {
    console.log('Proxy server stopped');
    process.exit(0);
  });
});
