const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

// Route imports
const osrmRoutes = require('./routes/osrm');
const trafficRoutes = require('./routes/traffic');
const statusRoutes = require('./routes/status');

// Middleware imports
const corsMiddleware = require('./middleware/cors');
const logger = require('./middleware/logger');
const { errorHandler, notFoundHandler } = require('./utils/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// ================================
// MIDDLEWARE SETUP
// ================================
app.use(helmet()); // Güvenlik
app.use(compression()); // Gzip compression
app.use(corsMiddleware); // CORS ayarları
app.use(express.json());
app.use(logger); // Request logging

// ================================
// ROUTES
// ================================
app.use('/api', osrmRoutes);
app.use('/api', trafficRoutes);
app.use('/api', statusRoutes);

// ================================
// ERROR HANDLING
// ================================
app.use('*', notFoundHandler);
app.use(errorHandler);

// ================================
// SERVER START
// ================================
app.listen(PORT, () => {
  console.log('🚀 Navigation Backend Server Started!');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🗺️  OSRM Base URL: ${process.env.OSRM_BASE_URL || 'http://localhost:5050'}`);
  console.log(`🚦 TomTom API: ${process.env.TOMTOM_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log('📝 Available endpoints:');
  console.log('   GET /api/health');
  console.log('   GET /api/route/v1/{profile}/{coordinates}');
  console.log('   GET /api/traffic/flow');
  console.log('   GET /api/status/osrm');
  console.log('   GET /api/status/tomtom');
  console.log('');
  console.log('💡 Frontend config.js baseUrl: http://localhost:3001/api');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});