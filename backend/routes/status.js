const express = require('express');
const axios = require('axios');
const { routeCache, trafficCache } = require('../middleware/cache');
const { API_ENDPOINTS, TEST_COORDS } = require('../utils/constants');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache: {
      routes: routeCache.getStats(),
      traffic: trafficCache.getStats()
    }
  });
});

// OSRM bağlantı durumu
router.get('/status/osrm', async (req, res) => {
  try {
    const osrmUrl = process.env.OSRM_BASE_URL || 'http://localhost:5050';
    const testUrl = `${osrmUrl}/route/v1/driving/29.0320,40.9923;29.0158,41.0265?overview=false`;
    
    const response = await axios.get(testUrl, { timeout: 5000 });
    
    res.json({
      status: 'connected',
      url: osrmUrl,
      port: 5050,
      response_code: response.data.code,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'disconnected',
      url: process.env.OSRM_BASE_URL || 'http://localhost:5050',
      port: 5050,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// TomTom bağlantı durumu
router.get('/status/tomtom', async (req, res) => {
  try {
    const apiKey = process.env.TOMTOM_API_KEY;
    if (!apiKey) {
      return res.status(401).json({
        status: 'not_configured',
        message: 'API key not set'
      });
    }
    
    // ✅ DOĞRU TomTom URL format
    const testUrl = API_ENDPOINTS.TOMTOM_FLOW;
    const testPoint = `${TEST_COORDS.ISTANBUL.CENTER[1]},${TEST_COORDS.ISTANBUL.CENTER[0]}`; // lat,lon
    
    console.log('🧪 Testing TomTom with URL:', testUrl);
    console.log('📍 Test point:', testPoint);
    
    const response = await axios.get(testUrl, {
      params: {
        key: apiKey,
        point: testPoint
      },
      timeout: 5000
    });
    
    res.json({
      status: 'connected',
      api_key_valid: true,
      endpoint: testUrl,
      test_point: testPoint,
      response_code: response.status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.response?.status || 503).json({
      status: 'error',
      api_key_valid: error.response?.status !== 403,
      endpoint: API_ENDPOINTS.TOMTOM_FLOW,
      error: error.message,
      response_status: error.response?.status,
      response_data: error.response?.data,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;