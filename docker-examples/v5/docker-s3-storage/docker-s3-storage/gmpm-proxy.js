#!/usr/bin/env node

/**
 * GameMaker Package Manager - npm Proxy
 *
 * Automatically adds your license JWT to npm requests
 *
 * Installation:
 *   curl -O https://your-server.com/gmpm-proxy.js
 *   chmod +x gmpm-proxy.js
 *
 * Usage:
 *   export LICENSE_JWT="your-license-jwt-from-email"
 *   node gmpm-proxy.js
 *
 * Then in another terminal:
 *   npm config set registry http://localhost:8873
 *   npm login
 *   npm install @gmpm/switch-sdk
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PROXY_PORT = process.argv[2] || 8873;
const VERDACCIO_URL = process.argv[3] || 'http://localhost:4873';
const LICENSE_JWT = process.env.LICENSE_JWT;

if (!LICENSE_JWT) {
  console.error('❌ ERROR: LICENSE_JWT environment variable is required!');
  console.error('');
  console.error('Usage:');
  console.error('  export LICENSE_JWT="your-license-jwt-from-email"');
  console.error('  node gmpm-proxy.js [port] [verdaccio-url]');
  console.error('');
  console.error('Example:');
  console.error('  export LICENSE_JWT="eyJhbGci..."');
  console.error('  node gmpm-proxy.js 8873 http://your-verdaccio-server:4873');
  console.error('');
  process.exit(1);
}

const verdaccioHost = url.parse(VERDACCIO_URL);
const useHttps = verdaccioHost.protocol === 'https:';
const httpModule = useHttps ? https : http;

// Create HTTP server
const server = http.createServer((req, res) => {
  const options = {
    hostname: verdaccioHost.hostname,
    port: verdaccioHost.port || (useHttps ? 443 : 80),
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      'Client-Authorization': `Bearer ${LICENSE_JWT}`,
      host: verdaccioHost.host
    }
  };

  const proxyReq = httpModule.request(options, (proxyRes) => {
    // Log request
    const hasAuth = req.headers.authorization ? '✓' : '✗';
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log(`  Authorization (npm): ${hasAuth}`);
    console.log(`  Client-Authorization (license): ✓`);
    console.log(`  Status: ${proxyRes.statusCode}`);
    console.log('');

    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('❌ Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({
      error: 'Proxy error',
      message: err.message
    }));
  });

  req.pipe(proxyReq);
});

// Start server
server.listen(PROXY_PORT, () => {
  console.log('================================================================================');
  console.log('🎮 GameMaker Package Manager - npm Proxy');
  console.log('================================================================================');
  console.log('');
  console.log(`✓ Proxy running on:     http://localhost:${PROXY_PORT}`);
  console.log(`✓ Forwarding to:        ${VERDACCIO_URL}`);
  console.log(`✓ License JWT loaded:   ${LICENSE_JWT.substring(0, 30)}...`);
  console.log('');
  console.log('📋 Setup Instructions:');
  console.log('');
  console.log('1. Open a NEW terminal and configure npm:');
  console.log(`   npm config set registry http://localhost:${PROXY_PORT}`);
  console.log('');
  console.log('2. Login to get your npm token:');
  console.log('   npm login');
  console.log('   (Enter the username/password from your email)');
  console.log('');
  console.log('3. Install packages:');
  console.log('   npm install @gmpm/switch-sdk');
  console.log('');
  console.log('💡 The proxy automatically adds your license JWT to all requests!');
  console.log('');
  console.log('================================================================================');
  console.log('');
  console.log('📡 Waiting for requests...');
  console.log('');
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('');
  console.log('🛑 Shutting down proxy server...');
  server.close(() => {
    console.log('✓ Proxy server stopped');
    process.exit(0);
  });
});
