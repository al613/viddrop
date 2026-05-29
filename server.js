const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

const analyzeRouter = require('./routes/analyze');
const downloadRouter = require('./routes/download');

const app = express();
const PORT = process.env.PORT || 3000;

// مهم للاستضافة خلف Proxy مثل Render
app.set('trust proxy', 1);

// Middleware
app.use(cors());

// مهم: نعطّل CSP لأن index.html يحتوي inline CSS/JS + Google Fonts
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(morgan('dev'));

// حد لحجم البيانات القادمة من المستخدم
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limit عام على كل API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'طلبات كثيرة جدًا. جرّب بعد شوي.'
  }
});

// Rate limit أقوى على التحميل
const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'وصلت لحد التحميل المسموح. جرّب بعد ساعة.'
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    app: 'VidDrop',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    app: 'VidDrop',
    timestamp: new Date().toISOString()
  });
});

// API limit
app.use('/api', apiLimiter);

// API routes
app.use('/api/analyze', analyzeRouter);
app.use('/api/download', downloadLimiter, downloadRouter);

// لو أحد طلب API غير موجود، لا ترجع له index.html
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API route not found'
  });
});

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all للواجهة
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start
app.listen(PORT, () => {
  console.log(`🔥 Server running on port ${PORT}`);
});