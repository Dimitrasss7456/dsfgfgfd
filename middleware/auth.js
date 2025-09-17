// Secure API key authentication middleware
const crypto = require('crypto');

// Generate a secure API key if none is set
const generateSecureApiKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Store the generated key for session (in production, use proper session management)
let sessionApiKey = null;

// Initialize session API key if needed
const initializeApiKey = () => {
  const apiKey = process.env.ADMIN_API_KEY;
  
  // Generate session key if no environment key is set (development only)
  if (!apiKey && process.env.NODE_ENV !== 'production') {
    if (!sessionApiKey) {
      sessionApiKey = generateSecureApiKey();
      console.log(`\n⚠️  БЕЗОПАСНОСТЬ: API ключ не настроен!`);
      console.log(`🔑 Временный ключ для сессии: ${sessionApiKey}`);
      console.log(`💡 Для производства установите ADMIN_API_KEY в переменные окружения\n`);
    }
  }
  
  return apiKey || sessionApiKey;
};

const authenticate = (req, res, next) => {
  const validKey = initializeApiKey();
  
  if (!validKey) {
    return res.status(500).json({ 
      error: 'Server configuration error: ADMIN_API_KEY not set',
      hint: 'Set ADMIN_API_KEY environment variable'
    });
  }
  
  const providedKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!providedKey || providedKey !== validKey) {
    return res.status(401).json({ 
      error: 'Unauthorized: Valid API key required',
      hint: 'Provide API key in X-API-Key header or api_key query parameter'
    });
  }
  
  next();
};

// API endpoint to get current API key (development only)
const getApiKeyInfo = (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not available in production' });
  }
  
  const apiKey = initializeApiKey();
  
  res.json({
    hasKey: !!apiKey,
    isFromEnv: !!process.env.ADMIN_API_KEY,
    keyPreview: apiKey ? `${apiKey.substring(0, 8)}...${apiKey.slice(-4)}` : null,
    fullKey: apiKey // Only for development!
  });
};

module.exports = { authenticate, getApiKeyInfo };