const express = require('express');
const axios = require('axios');
const { routeCache } = require('../middleware/cache');
const { 
  DEFAULTS, 
  ERROR_MESSAGES, 
  HTTP_STATUS, 
  CACHE_PREFIXES 
} = require('../utils/constants');

const router = express.Router();

// OSRM Route endpoint
router.get('/route/v1/:profile/:coordinates', async (req, res) => {
  try {
    const { profile, coordinates } = req.params;
    const queryParams = req.query;
    
    // Cache key oluştur
    const cacheKey = `${CACHE_PREFIXES.ROUTE}${profile}_${coordinates}_${JSON.stringify(queryParams)}`;
    
    // Cache'e bak
    const cached = routeCache.get(cacheKey);
    if (cached) {
      console.log('🎯 Route cache HIT:', cacheKey);
      return res.json(cached);
    }
    
    // OSRM URL'i oluştur
    const osrmUrl = process.env.OSRM_BASE_URL || DEFAULTS.OSRM_URL;
    const url = `${osrmUrl}/route/v1/${profile}/${coordinates}`;
    
    console.log('🌐 OSRM Request:', url, queryParams);
    
    // OSRM'ye istek gönder
    const response = await axios.get(url, {
      params: queryParams,
      timeout: DEFAULTS.REQUEST_TIMEOUT
    });
    
    // Cache'e kaydet
    routeCache.set(cacheKey, response.data);
    console.log('💾 Route cached:', cacheKey);
    
    res.json(response.data);
    
  } catch (error) {
    console.error('❌ OSRM Error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        error: 'OSRM service unavailable',
        message: ERROR_MESSAGES.OSRM_UNAVAILABLE,
        code: 'SERVICE_UNAVAILABLE',
        port: 5050
      });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({
        error: 'OSRM API Error',
        message: error.response.data?.message || 'Unknown OSRM error',
        code: error.response.data?.code || 'UNKNOWN'
      });
    }
    
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      error: 'Internal Server Error',
      message: ERROR_MESSAGES.ROUTE_FAILED,
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;