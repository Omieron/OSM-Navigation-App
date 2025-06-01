const cors = require('cors');
const { ALLOWED_ORIGINS } = require('../utils/constants');

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

module.exports = cors(corsOptions);