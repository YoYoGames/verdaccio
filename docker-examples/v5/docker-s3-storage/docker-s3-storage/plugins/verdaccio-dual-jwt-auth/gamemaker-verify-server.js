#!/usr/bin/env node

/**
 * GameMaker API Verification Server
 *
 * Verifies licenses against GameMaker API:
 * GET https://test.api.gamemaker.team/api/2/licence
 */

const express = require('express');
const fetch = require('node-fetch');

const PORT = process.argv[2] || 3000;
const GAMEMAKER_API_URL = process.env.GAMEMAKER_API_URL || 'https://test.api.gamemaker.team/api/2/licence';

const app = express();
app.use(express.json());

// Cache to reduce API calls
const cache = new Map();
const CACHE_TTL = 300000; // 5 minutes

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/verify-license', (req, res) => {
  res.json({
    status: 'ok',
    message: 'GameMaker verification server running',
    api: GAMEMAKER_API_URL,
    timestamp: new Date().toISOString()
  });
});

// Main verification endpoint
app.post('/verify-license', async (req, res) => {
  const { token } = req.body;
  const authHeader = req.headers.authorization;

  console.log('================================================================================');
  console.log('License Verification Request');
  console.log('================================================================================');

  // Extract JWT
  const licenseJWT = token || (authHeader && authHeader.replace('Bearer ', ''));

  if (!licenseJWT) {
    console.log('❌ No token provided');
    return res.status(400).json({
      valid: false,
      error: 'No token provided'
    });
  }

  // Check cache
  const cached = cache.get(licenseJWT);
  if (cached && Date.now() < cached.expiresAt) {
    console.log('✅ Using cached result');
    console.log('================================================================================');
    return res.json(cached.result);
  }

  try {
    // Decode JWT to extract user info
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(licenseJWT);

    if (!decoded) {
      console.log('❌ Invalid JWT format');
      return res.status(400).json({
        valid: false,
        error: 'Invalid JWT format'
      });
    }

    console.log(`User: ${decoded.email || decoded.user}`);

    // Extract parameters for GameMaker API
    const deviceId = decoded.device_id || decoded.deviceId || 'verdaccio-server';
    const accessKey = decoded.access_key || decoded.accessKey || decoded.license_key;
    const userEmail = decoded.email || decoded.user;

    // Call GameMaker API
    const result = await verifyWithGameMakerAPI(deviceId, accessKey, userEmail);

    // Cache valid results
    if (result.valid) {
      cache.set(licenseJWT, {
        result,
        expiresAt: Date.now() + CACHE_TTL
      });
    }

    console.log(result.valid ? '✅ License verified' : '❌ License invalid');
    console.log('================================================================================');

    res.json(result);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('================================================================================');

    res.status(500).json({
      valid: false,
      error: error.message
    });
  }
});

/**
 * Call GameMaker API to verify license
 */
async function verifyWithGameMakerAPI(deviceId, accessKey, userEmail) {
  console.log(`Calling GameMaker API: ${GAMEMAKER_API_URL}`);
  console.log(`  device_id: ${deviceId}`);
  console.log(`  access_key: ${accessKey ? accessKey.substring(0, 10) + '...' : 'not provided'}`);

  try {
    // Build query parameters
    const params = new URLSearchParams({
      device_id: deviceId,
      c: accessKey || '' // 'c' parameter is required
    });

    if (accessKey) {
      params.append('access_key', accessKey);
    }

    const url = `${GAMEMAKER_API_URL}?${params}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Verdaccio-GameMaker/1.0',
        'Accept': 'application/json, application/x-plist, */*'
      },
      timeout: 10000
    });

    if (!response.ok) {
      console.error(`API error: ${response.status}`);
      return {
        valid: false,
        error: `API returned ${response.status}`
      };
    }

    // Parse response (plist or JSON)
    const contentType = response.headers.get('content-type');
    let data;

    if (contentType?.includes('application/x-plist') || contentType?.includes('text/xml')) {
      // Parse plist
      const plist = require('plist');
      const plistText = await response.text();
      data = plist.parse(plistText);
      console.log('Parsed plist response');
    } else {
      // Parse JSON
      data = await response.json();
      console.log('Parsed JSON response');
    }

    console.log('Response data:', JSON.stringify(data, null, 2));

    // Extract console platforms from owned components
    const consoles = extractConsolePlatforms(data);

    console.log(`Consoles: ${consoles.join(', ') || 'none'}`);

    return {
      valid: true,
      email: userEmail || data.email || data.user_email,
      consoles: consoles,
      groups: consolesToGroups(consoles),
      metadata: {
        api: 'gamemaker',
        components: data.components || data.owned_components || []
      }
    };

  } catch (error) {
    console.error('API call failed:', error.message);
    return {
      valid: false,
      error: `API call failed: ${error.message}`
    };
  }
}

/**
 * Extract console platforms from GameMaker API response
 */
function extractConsolePlatforms(data) {
  // Get components/platforms from response
  const components = data.components || data.owned_components || data.platforms || [];

  if (!Array.isArray(components)) {
    return [];
  }

  const consoleKeywords = {
    'switch': 'switch',
    'nintendo': 'switch',
    'ps4': 'ps4',
    'playstation4': 'ps4',
    'playstation_4': 'ps4',
    'ps5': 'ps5',
    'playstation5': 'ps5',
    'playstation_5': 'ps5',
    'xbox': 'xbox',
    'xboxone': 'xboxone',
    'xbox_one': 'xboxone',
    'xboxseries': 'xboxseries',
    'xbox_series': 'xboxseries'
  };

  const consoles = [];

  components.forEach(component => {
    const name = typeof component === 'string' ? component : component.name || '';
    const normalized = name.toLowerCase().replace(/[\s-_]/g, '');

    for (const [keyword, console] of Object.entries(consoleKeywords)) {
      if (normalized.includes(keyword)) {
        if (!consoles.includes(console)) {
          consoles.push(console);
        }
        break;
      }
    }
  });

  return consoles;
}

/**
 * Convert consoles to Verdaccio groups
 */
function consolesToGroups(consoles) {
  const groupMap = {
    'switch': 'switch-developers',
    'ps4': 'ps4-developers',
    'ps5': 'ps5-developers',
    'xbox': 'xbox-developers',
    'xboxone': 'xboxone-developers',
    'xboxseries': 'xboxseries-developers'
  };

  return consoles.map(c => groupMap[c] || `${c}-developers`);
}

// Start server
app.listen(PORT, () => {
  console.log('================================================================================');
  console.log('GameMaker API Verification Server');
  console.log('================================================================================');
  console.log('');
  console.log(`Server:      http://localhost:${PORT}`);
  console.log(`GameMaker:   ${GAMEMAKER_API_URL}`);
  console.log('');
  console.log('JWT must contain:');
  console.log('  {');
  console.log('    "email": "user@example.com",');
  console.log('    "access_key": "user-license-key",    // or license_key');
  console.log('    "device_id": "unique-device-id"      // optional');
  console.log('  }');
  console.log('');
  console.log('================================================================================');
  console.log('Waiting for requests...');
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});
