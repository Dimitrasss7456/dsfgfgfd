// Simple API key authentication middleware
const authenticate = (req, res, next) => {
  const apiKey = process.env.ADMIN_API_KEY;
  
  // For development, allow admin123 if no env var is set
  const fallbackKey = process.env.NODE_ENV === 'production' ? null : 'admin123';
  const validKey = apiKey || fallbackKey;
  
  if (!validKey) {
    return res.status(500).json({ 
      error: 'Server configuration error: ADMIN_API_KEY not set'
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

module.exports = { authenticate };