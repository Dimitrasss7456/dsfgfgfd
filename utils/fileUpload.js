const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Safe filename generation
function generateSafeFilename(originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase();
  const basename = path.basename(originalFilename, ext);
  
  // Sanitize the basename - remove dangerous characters
  const sanitizedBasename = basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 50); // Limit length
  
  // Generate unique filename with UUID
  const uniqueId = uuidv4().split('-')[0];
  return `${sanitizedBasename}_${uniqueId}${ext}`;
}

// Allowed file types for MAX messenger
const allowedMimeTypes = [
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  // Documents
  'application/pdf', 'application/msword', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Text
  'text/plain', 'text/csv',
  // Archives
  'application/zip', 'application/x-rar-compressed',
  // Audio/Video (common formats)
  'audio/mp3', 'audio/wav', 'audio/ogg', 'video/mp4', 'video/webm'
];

// Configure multer with security measures
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeFilename = generateSafeFilename(file.originalname);
    cb(null, safeFilename);
  }
});

const fileFilter = (req, file, cb) => {
  // Check if file type is allowed
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Тип файла не поддерживается: ${file.mimetype}`), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit (reasonable for Replit)
    files: 1 // Only one file at a time
  }
});

// Helper function to validate file before processing
function validateUploadedFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Файл не найден');
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size > 50 * 1024 * 1024) {
    throw new Error('Размер файла превышает допустимый лимит');
  }
  
  return {
    size: stats.size,
    path: filePath,
    name: path.basename(filePath)
  };
}

// Helper to clean up old uploaded files (cleanup utility)
function cleanupOldFiles(maxAgeHours = 24) {
  const maxAge = Date.now() - (maxAgeHours * 60 * 60 * 1000);
  
  fs.readdir(uploadDir, (err, files) => {
    if (err) return;
    
    files.forEach(file => {
      const filePath = path.join(uploadDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        
        if (stats.mtime.getTime() < maxAge) {
          fs.unlink(filePath, (err) => {
            if (!err) {
              console.log(`Cleaned up old file: ${file}`);
            }
          });
        }
      });
    });
  });
}

// Helper to resolve file ID to full path (for security)
function getFilePathFromId(fileId) {
  if (!fileId) return null;
  
  // Simple validation to prevent path traversal
  if (fileId.includes('..') || fileId.includes('/') || fileId.includes('\\')) {
    throw new Error('Invalid file ID');
  }
  
  const filePath = path.join(uploadDir, fileId);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  return filePath;
}

module.exports = {
  upload,
  validateUploadedFile,
  cleanupOldFiles,
  generateSafeFilename,
  getFilePathFromId,
  uploadDir
};