// API Endpoints
const API_ENDPOINTS = {
  // ✅ DOĞRU TomTom format - eksik parametreleri ekledik
  TOMTOM_FLOW: 'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json',
  OSRM_ROUTE: '/route/v1'
};

// Default Values
const DEFAULTS = {
  OSRM_URL: 'http://localhost:5050',
  SERVER_PORT: 3001,
  REQUEST_TIMEOUT: 15000,
  TRAFFIC_TIMEOUT: 10000,
  CACHE_TTL: {
    ROUTE: 300,    // 5 dakika
    TRAFFIC: 180   // 3 dakika
  }
};

// Error Messages
const ERROR_MESSAGES = {
  OSRM_UNAVAILABLE: 'OSRM Docker container is not running on port 5050',
  TOMTOM_NO_KEY: 'TomTom API key not configured',
  TOMTOM_INVALID_KEY: 'Invalid TomTom API key or quota exceeded',
  TOMTOM_RATE_LIMIT: 'TomTom API rate limit exceeded',
  MISSING_POINT: 'Point parameter is required (format: lat,lon)',
  ROUTE_FAILED: 'Route calculation failed',
  INTERNAL_ERROR: 'Something went wrong'
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// TomTom Response Defaults (fallback data)
const TOMTOM_FALLBACK = {
  currentSpeed: 45,
  freeFlowSpeed: 50,
  confidence: 0.3,
  trafficFactor: 1.1
};

// OSRM Profiles
const OSRM_PROFILES = {
  CAR: 'driving',
  BIKE: 'cycling', 
  WALK: 'walking'
};

// Cache Keys
const CACHE_PREFIXES = {
  ROUTE: 'route_',
  TRAFFIC: 'traffic_'
};

// CORS Allowed Origins
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:5500', 
  'http://localhost:5500',
  'http://localhost:8080',
  'http://localhost:3001'
];

// Test Coordinates (Istanbul)
const TEST_COORDS = {
  ISTANBUL: {
    KADIKOY: [29.0320, 40.9923],
    USKUDAR: [29.0158, 41.0265],
    CENTER: [28.9784, 41.0082]
  }
};

module.exports = {
  API_ENDPOINTS,
  DEFAULTS,
  ERROR_MESSAGES,
  HTTP_STATUS,
  TOMTOM_FALLBACK,
  OSRM_PROFILES,
  CACHE_PREFIXES,
  ALLOWED_ORIGINS,
  TEST_COORDS
};