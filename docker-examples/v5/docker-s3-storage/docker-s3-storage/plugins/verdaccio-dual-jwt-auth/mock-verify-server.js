#!/usr/bin/env node

/**
 * Mock Verification Server for Testing
 *
 * Simulates an external verification server that validates license JWTs
 *
 * Usage: node mock-verify-server.js [port]
 */

const express = require('express');
const jwt = require('jsonwebtoken');

const PORT = process.argv[2] || 3000;
const LICENSE_SECRET = process.env.LICENSE_SECRET || process.env.JWT_SECRET;

const app = express();
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// POST /verify-license - Main verification endpoint
app.post('/verify-license', async (req, res) => {
  const { token } = req.body;
  const authHeader = req.headers.authorization;

  console.log('================================================================================');
  console.log('Verification Request');
  console.log('================================================================================');
  console.log('Body token:', token ? token.substring(0, 50) + '...' : 'missing');
  console.log('Auth header:', authHeader ? 'present' : 'missing');
  console.log('');

  if (!token) {
    console.log('❌ No token provided');
    return res.status(400).json({
      valid: false,
      error: 'No token provided'
    });
  }

  try {
    // Verify JWT signature
    const decoded = jwt.verify(token, LICENSE_SECRET);

    console.log('✅ JWT signature valid');
    console.log('Decoded payload:', JSON.stringify(decoded, null, 2));
    console.log('');

    // Extract user info
    const email = decoded.email || decoded.user;
    const consoles = decoded.consoles || decoded.subscriptions || [];

    // Simulate database lookup delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Mock business logic - check if subscription is active
    // In production, this would check your database
    const mockUser = {
      email: email,
      subscriptionActive: true,
      consoles: consoles,
      subscriptionId: 'sub_mock_123',
      tier: 'pro',
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    };

    console.log('Mock User Data:', JSON.stringify(mockUser, null, 2));
    console.log('');

    if (!mockUser.subscriptionActive) {
      console.log('❌ Subscription inactive');
      return res.status(401).json({
        valid: false,
        error: 'Subscription inactive',
        message: 'Your subscription has been cancelled or expired'
      });
    }

    // Map consoles to groups
    const groupMap = {
      'ps4': 'ps4-developers',
      'ps5': 'ps5-developers',
      'xbox': 'xbox-developers',
      'xboxone': 'xboxone-developers',
      'xboxseries': 'xboxseries-developers',
      'switch': 'switch-developers'
    };

    const groups = consoles.map(c => groupMap[c.toLowerCase()] || c);

    const response = {
      valid: true,
      email: mockUser.email,
      consoles: mockUser.consoles,
      groups: groups,
      metadata: {
        subscriptionId: mockUser.subscriptionId,
        tier: mockUser.tier,
        expiresAt: mockUser.expiresAt,
        verified: true,
        verifiedAt: new Date().toISOString()
      }
    };

    console.log('✅ Verification successful');
    console.log('Response:', JSON.stringify(response, null, 2));
    console.log('================================================================================');
    console.log('');

    res.json(response);

  } catch (error) {
    console.log('❌ JWT verification failed:', error.message);
    console.log('================================================================================');
    console.log('');

    res.status(401).json({
      valid: false,
      error: error.message,
      message: 'Invalid or expired license token'
    });
  }
});

// GET /verify-license - Health check
app.get('/verify-license', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Verification server is running',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('================================================================================');
  console.log('Mock Verification Server');
  console.log('================================================================================');
  console.log('');
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Endpoint: POST http://localhost:${PORT}/verify-license`);
  console.log(`LICENSE_SECRET: ${LICENSE_SECRET ? LICENSE_SECRET.substring(0, 20) + '...' : 'NOT SET'}`);
  console.log('');
  console.log('Test with curl:');
  console.log(`  curl -X POST http://localhost:${PORT}/verify-license \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"token": "your-jwt-token"}'`);
  console.log('');
  console.log('================================================================================');
  console.log('');
  console.log('Waiting for requests...');
  console.log('');
});
