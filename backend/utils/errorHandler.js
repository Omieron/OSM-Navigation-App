// 404 handler
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: [
      'GET /api/health',
      'GET /api/route/v1/{profile}/{coordinates}',
      'GET /api/traffic/flow?point=lat,lon',
      'GET /api/status/osrm',
      'GET /api/status/tomtom'
    ]
  });
};

// Global error handler
const errorHandler = (error, req, res, next) => {
  console.error('💥 Unhandled error:', error);
  
  // Eğer response zaten gönderildiyse, default error handler'a devret
  if (res.headersSent) {
    return next(error);
  }
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Something went wrong',
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};