const NodeCache = require('node-cache');

// Cache instances
const routeCache = new NodeCache({ 
  stdTTL: parseInt(process.env.ROUTE_CACHE_TTL) || 300,  // 5 dakika
  checkperiod: 60  // Her dakika expired cache'leri temizle
});

const trafficCache = new NodeCache({ 
  stdTTL: parseInt(process.env.TRAFFIC_CACHE_TTL) || 180,  // 3 dakika
  checkperiod: 30  // Her 30 saniyede expired cache'leri temizle
});

module.exports = {
  routeCache,
  trafficCache
};