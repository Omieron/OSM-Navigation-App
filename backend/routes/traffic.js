const express = require('express');
const axios = require('axios');
const { trafficCache } = require('../middleware/cache');
const { API_ENDPOINTS } = require('../utils/constants');

const router = express.Router();

// TomTom Traffic Flow endpoint
router.get('/traffic/flow', async (req, res) => {
  try {
    const { point } = req.query;
    
    if (!point) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'Point parameter is required (format: lat,lon)'
      });
    }
    
    // Cache key oluştur
    const cacheKey = `traffic_${point}`;
    
    // Cache'e bak
    const cached = trafficCache.get(cacheKey);
    if (cached) {
      console.log('🎯 Traffic cache HIT:', cacheKey);
      return res.json(cached);
    }
    
    // TomTom API key kontrolü
    const apiKey = process.env.TOMTOM_API_KEY;
    console.log('🔑 API Key check:', apiKey ? `${apiKey.slice(0, 10)}...` : 'NOT SET');
    
    if (!apiKey || apiKey === 'YOUR_TOMTOM_API_KEY_HERE') {
      return res.status(401).json({
        error: 'TomTom API key not configured',
        message: 'Please set TOMTOM_API_KEY in environment variables'
      });
    }
    
    // ✅ DOĞRU TomTom API URL - constants'tan al
    const tomtomUrl = API_ENDPOINTS.TOMTOM_FLOW;
    
    console.log('🌐 TomTom Request URL:', tomtomUrl);
    console.log('📍 Point:', point);
    console.log('🔑 Using API Key:', `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`);
    
    const response = await axios.get(tomtomUrl, {
      params: {
        key: apiKey,
        point: point
        // format zaten URL'de (json), style ve zoom da var (absolute/10)
      },
      timeout: 10000 // 10 saniye timeout
    });
    
    console.log('✅ TomTom Response Status:', response.status);
    console.log('📊 TomTom Data:', response.data);
    
    // Response'u normalize et
    const normalizedData = {
      currentSpeed: response.data.flowSegmentData?.currentSpeed || 50,
      freeFlowSpeed: response.data.flowSegmentData?.freeFlowSpeed || 50,
      confidence: response.data.flowSegmentData?.confidence || 0.7,
      trafficFactor: (response.data.flowSegmentData?.freeFlowSpeed || 50) / 
                    (response.data.flowSegmentData?.currentSpeed || 50),
      rawData: response.data
    };
    
    // Cache'e kaydet
    trafficCache.set(cacheKey, normalizedData);
    console.log('💾 Traffic cached:', cacheKey);
    
    res.json(normalizedData);
    
  } catch (error) {
    console.error('❌ TomTom Error Details:');
    console.error('   Message:', error.message);
    console.error('   Code:', error.code);
    console.error('   Response Status:', error.response?.status);
    console.error('   Response Data:', error.response?.data);
    
    if (error.response?.status === 403) {
      return res.status(403).json({
        error: 'TomTom API access denied',
        message: 'Invalid API key or quota exceeded',
        responseData: error.response.data
      });
    }
    
    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'TomTom API rate limit exceeded',
        message: 'Please wait before making more requests'
      });
    }
    
    // Fallback data döndür
    console.log('📦 Returning fallback data due to TomTom API error');
    res.json({
      currentSpeed: 45,
      freeFlowSpeed: 50,
      confidence: 0.3,
      trafficFactor: 1.1,
      fallback: true,
      error: 'TomTom API unavailable, using fallback data',
      errorDetails: {
        message: error.message,
        status: error.response?.status,
        code: error.code
      }
    });
  }
});

module.exports = router;