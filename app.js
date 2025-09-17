const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Import database helper
const { dbHelpers } = require('./db');

// Import secure file upload helper
const { upload, validateUploadedFile, cleanupOldFiles } = require('./utils/fileUpload');

// Import authentication middleware
const { authenticate, getApiKeyInfo } = require('./middleware/auth');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Clean up old files on startup (files older than 24 hours)
cleanupOldFiles(24);

// Import routes
const accountsRouter = require('./routes/accounts');
const contactsRouter = require('./routes/contacts');
const messagesRouter = require('./routes/messages');

// Use routes with authentication for sensitive operations
app.use('/api/accounts', authenticate, accountsRouter);
app.use('/api/contacts', authenticate, contactsRouter);
app.use('/api/messages', authenticate, messagesRouter);

// Secure upload endpoint with authentication
app.post('/api/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не загружен' });
  }
  
  try {
    const fileInfo = validateUploadedFile(req.file.path);
    
    // Generate secure file ID instead of exposing server path
    const fileId = req.file.filename;
    
    res.json({
      message: 'Файл успешно загружен',
      fileId: fileId,
      originalName: req.file.originalname,
      size: fileInfo.size
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ error: error.message });
  }
});

// Development API key info endpoint
app.get('/api/auth/info', getApiKeyInfo);

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Откройте http://localhost:${PORT} в браузере`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Закрытие сервера...');
  dbHelpers.close().then(() => {
    process.exit(0);
  });
});

module.exports = app;