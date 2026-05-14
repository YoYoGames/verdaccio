const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const plist = require('plist');

/**
 * GameMaker Auth Middleware for Verdaccio
 *
 * Two classes of user are supported:
 *
 *   Customers (GameMaker developers installing packages):
 *     - Never log in to Verdaccio.
 *     - Must include a valid GameMaker JWT on every request via X-GameMaker-Token.
 *     - Must also include X-GameMaker-Device-ID (the MD5 of their machine ID).
 *     - If requiredLicence is configured, the user must hold that console licence.
 *
 *   Internal developers (publishing packages):
 *     - Log in with ADMIN_USERNAME / ADMIN_PASSWORD credentials.
 *     - Subsequent requests carry a Verdaccio session token (Authorization: Bearer).
 *     - This middleware passes those through; Verdaccio verifies the session.
 *
 * Config options (all optional, env vars take precedence):
 *   gameMakerAuthUrl  - OAuth userinfo endpoint (default: https://auth.gamemaker.io/oauth/userinfo)
 *   licenceApiUrl     - Licence plist endpoint  (default: https://api.gamemaker.io/platform/v1/licence.plist)
 *   requiredLicence   - Console module that must be present in the licence response.
 *                       One of: ps4, ps5, xboxone, xboxseriesxs, switch, switch2
 *   timeout           - API request timeout in ms (default: 10000)
 *   cache             - Enable result caching (default: true)
 *   cacheTTL          - Cache TTL in ms (default: 300000 = 5 minutes)
 */

// Maps the configured requiredLicence value to every feature string that
// could represent it in the Features array of the licence plist response.
// Some consoles appear under a codename (jasper, milo, spud) as well as
// their module name — both must be accepted.
const LICENCE_FEATURES = {
  ps4:          ['ps4'],
  ps5:          ['ps5', 'jasper'],
  xboxone:      ['xboxone'],
  xboxseriesxs: ['xboxseriesxs', 'milo'],
  switch:       ['switch'],
  switch2:      ['switch2', 'spud']
};

class GameMakerAuthPlugin {
  constructor(config, options) {
    this.logger = options.logger;
    this.config = config || {};

    this.gameMakerAuthUrl = this.config.gameMakerAuthUrl
      || process.env.GAMEMAKER_AUTH_URL
      || 'https://auth.gamemaker.io/oauth/userinfo';

    this.licenceApiUrl = this.config.licenceApiUrl
      || process.env.GAMEMAKER_LICENCE_URL
      || 'https://api.gamemaker.io/platform/v1/licence.plist';

    this.requiredLicence = this.config.requiredLicence
      || process.env.REQUIRED_LICENCE
      || null;

    this.timeout = this.config.timeout || 10000;

    this.cacheEnabled = this.config.cache !== false;
    this.cacheTTL = this.config.cacheTTL || 300000;
    this.cache = new Map();

    if (this.requiredLicence && !LICENCE_FEATURES[this.requiredLicence]) {
      this.logger.warn(`[GameMaker Auth] Unknown requiredLicence value: "${this.requiredLicence}". Valid values: ${Object.keys(LICENCE_FEATURES).join(', ')}`);
    }

    this.logger.info('[GameMaker Auth] Plugin initialized');
    this.logger.info(`[GameMaker Auth] Required licence: ${this.requiredLicence || 'none (JWT validation only)'}`);
  }

  // Allow all package access — the GM JWT middleware already enforces auth
  // before Verdaccio's ACL runs. Without this, Verdaccio v5 ignores access: $all
  // for custom auth plugins and returns 401 for unauthenticated requests.
  allow_access(user, pkg, callback) {
    callback(null, true);
  }

  // Developer login. Only the pre-configured admin account can log in.
  authenticate(user, password, callback) {
    const adminUser = this.config.adminUsername || process.env.ADMIN_USERNAME;
    const adminPass = this.config.adminPassword || process.env.ADMIN_PASSWORD;

    if (!adminUser || !adminPass) {
      this.logger.error('[GameMaker Auth] Admin credentials not configured (ADMIN_USERNAME / ADMIN_PASSWORD)');
      return callback(new Error('Admin credentials not configured'));
    }

    if (user === adminUser && password === adminPass) {
      this.logger.info(`[GameMaker Auth] Admin login: ${user}`);
      return callback(null, [user, 'admin', '$authenticated', '$all']);
    }

    this.logger.warn(`[GameMaker Auth] Failed login attempt for: ${user}`);
    callback(new Error('Invalid credentials'));
  }

  // npm login is routed through adduser(). Allow the admin account; reject everything else.
  adduser(user, password, callback) {
    const adminUser = this.config.adminUsername || process.env.ADMIN_USERNAME;
    const adminPass = this.config.adminPassword || process.env.ADMIN_PASSWORD;

    if (adminUser && adminPass && user === adminUser && password === adminPass) {
      this.logger.info(`[GameMaker Auth] Admin login via adduser: ${user}`);
      return callback(null, true);
    }

    callback(new Error('User registration is not supported.'));
  }

  /**
   * Gate every request:
   *   - Verdaccio session token (Authorization: Bearer) → developer, pass through.
   *   - GameMaker JWT (X-GameMaker-Token) → validate, check licence if required.
   *   - Neither → 401.
   *
   * When requiredLicence is set, clients must also send X-GameMaker-Device-ID
   * (the uppercase MD5 of their machine ID, as computed by the GameMaker IDE).
   */
  register_middlewares(app, auth, storage) {
    const self = this;

    app.use(async (req, res, next) => {
      // Skip verdaccio-internal endpoints
      if (
        req.url === '/-/ping' ||
        req.url.startsWith('/-/verdaccio') ||
        req.url.startsWith('/-/v1/login') ||
        req.url.startsWith('/-/user/org.couchdb.user:')
      ) {
        return next();
      }

      // Check Authorization: Bearer — could be a Verdaccio session token or a GM JWT
      // sent via npm's standard auth mechanism (when gmpm writes the GM JWT as _authToken).
      const authHeader = req.headers['authorization'] || '';
      let gmJWT = null;
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        let decoded = null;
        try { decoded = jwt.decode(token); } catch (e) {}

        if (!decoded || decoded.iss !== 'GameMaker.io') {
          // Not a GM JWT — treat as a Verdaccio session token and pass through.
          self.logger.debug(`[GameMaker Auth] Verdaccio session on ${req.method} ${req.url}`);
          return next();
        }

        // GM JWT delivered via npm's Bearer mechanism — validate it below.
        gmJWT = token;
      }

      // Customers may also supply the GM JWT via explicit header.
      if (!gmJWT) {
        gmJWT = req.headers['x-gamemaker-token'];
        if (!gmJWT && req.body && typeof req.body === 'object') {
          gmJWT = req.body._gameMakerToken;
        }
      }

      if (!gmJWT) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Provide a GameMaker JWT via the X-GameMaker-Token header.'
        });
      }

      if (gmJWT.startsWith('Bearer ')) {
        gmJWT = gmJWT.slice(7);
      }

      // When licence checking is enabled, the client must also supply their device ID.
      const deviceId = req.headers['x-gamemaker-device-id'] || null;

      if (self.requiredLicence && !deviceId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Provide your GameMaker device ID via the X-GameMaker-Device-ID header.'
        });
      }

      self.logger.debug(`[GameMaker Auth] Verifying GM JWT on ${req.method} ${req.url}`);

      try {
        const result = await self._verifyGameMakerJWT(gmJWT, deviceId);

        if (!result.valid) {
          self.logger.warn(`[GameMaker Auth] Rejected on ${req.method} ${req.url}: ${result.error}`);
          return res.status(401).json({ error: 'Unauthorized', message: result.error });
        }

        self.logger.debug(`[GameMaker Auth] Accepted for ${result.email} on ${req.method} ${req.url}`);
        req.gameMakerUser = { email: result.email };
      } catch (err) {
        self.logger.error(`[GameMaker Auth] Middleware error: ${err.message}`);
        return res.status(500).json({ error: 'Token verification failed' });
      }

      next();
    });
  }

  async _verifyGameMakerJWT(gmJWT, deviceId) {
    const cacheKey = this.requiredLicence ? `${gmJWT}:${deviceId}` : gmJWT;

    if (this.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        this.logger.debug('[GameMaker Auth] Using cached result');
        return cached.result;
      }
    }

    // Decode without verifying signature — the API call is the source of truth.
    let decoded;
    try {
      decoded = jwt.decode(gmJWT);
    } catch (e) {
      return { valid: false, error: 'Malformed JWT' };
    }

    if (!decoded) {
      return { valid: false, error: 'Invalid JWT format' };
    }

    const result = this.requiredLicence
      ? await this._verifyWithLicence(gmJWT, decoded, deviceId)
      : await this._verifyWithUserInfo(gmJWT, decoded);

    if (result.valid && this.cacheEnabled) {
      this.cache.set(cacheKey, { result, expiresAt: Date.now() + this.cacheTTL });
      this._cleanCache();
    }

    return result;
  }

  /**
   * Validate the JWT via the OAuth userinfo endpoint.
   * Used when no requiredLicence is configured.
   */
  async _verifyWithUserInfo(gmJWT, decoded) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.gameMakerAuthUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gmJWT}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Verdaccio-GameMaker/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(`[GameMaker Auth] Userinfo API returned ${response.status}`);
        return { valid: false, error: `GameMaker API error: ${response.status}` };
      }

      const email = decoded.email || decoded.sub || decoded.user || '';
      return { valid: true, email };

    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return { valid: false, error: 'GameMaker API request timed out' };
      }
      this.logger.error(`[GameMaker Auth] Userinfo call failed: ${err.message}`);
      return { valid: false, error: `GameMaker API call failed: ${err.message}` };
    }
  }

  /**
   * Validate the JWT and check for the required console licence via licence.plist.
   * The client must supply their device ID (X-GameMaker-Device-ID header).
   */
  async _verifyWithLicence(gmJWT, decoded, deviceId) {
    const nonce = Math.floor(Math.random() * 2147483647);
    const url = `${this.licenceApiUrl}?c=${nonce}_${deviceId}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      this.logger.debug(`[GameMaker Auth] Calling licence API for device ${deviceId}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${gmJWT}`,
          'Accept': 'application/x-plist; charset=utf-8; version=1.0.0',
          'Content-Type': 'application/x-plist; charset=utf-8',
          'User-Agent': 'GameMaker Studio 2 v2024.0.0.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(`[GameMaker Auth] Licence API returned ${response.status}`);
        return { valid: false, error: `GameMaker licence API error: ${response.status}` };
      }

      const body = await response.text();
      let data;
      try {
        data = plist.parse(body);
      } catch (e) {
        this.logger.error(`[GameMaker Auth] Failed to parse licence plist: ${e.message}`);
        return { valid: false, error: 'Failed to parse licence response' };
      }

      const features = data.Features || [];
      if (!this._hasRequiredLicence(features)) {
        this.logger.warn(`[GameMaker Auth] User does not have required licence: ${this.requiredLicence}`);
        return { valid: false, error: `This registry requires a ${this.requiredLicence} licence` };
      }

      const email = decoded.email || decoded.sub || decoded.user || '';
      this.logger.debug(`[GameMaker Auth] Licence check passed for ${email} (${this.requiredLicence})`);
      return { valid: true, email };

    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return { valid: false, error: 'GameMaker licence API request timed out' };
      }
      this.logger.error(`[GameMaker Auth] Licence API call failed: ${err.message}`);
      return { valid: false, error: `GameMaker licence API call failed: ${err.message}` };
    }
  }

  /**
   * Check whether the Features array from the licence plist contains the
   * required console licence. Handles both direct module names and codenames.
   */
  _hasRequiredLicence(features) {
    // Internal YoYo developers bypass the console licence check.
    if (features.some(f => f.trim() === 'debug.internal')) return true;

    const accepted = LICENCE_FEATURES[this.requiredLicence];
    if (!accepted) return false;
    return features.some(f => accepted.includes(f.trim()));
  }

  _cleanCache() {
    if (Math.random() > 0.05) return;

    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of this.cache.entries()) {
      if (now >= value.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`[GameMaker Auth] Evicted ${cleaned} expired cache entries`);
    }
  }
}

module.exports = function (config, options) {
  return new GameMakerAuthPlugin(config, options);
};
