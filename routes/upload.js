const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const cloudinary = require('cloudinary').v2;
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../utils/storage');

// Configure cloudinary using CLOUDINARY_URL if it exists in env
// Or using individual keys if provided
if (process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) {
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  }
}

// Create uploads directory if it doesn't exist
const isVercel = process.env.VERCEL === '1';
const uploadDir = isVercel ? '/tmp/uploads' : path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9]/g, '-').replace(ext, '');
    cb(null, sanitizedName + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // 1. Prioritize Cloudflare R2
    if (s3Client && process.env.R2_PUBLIC_URL && process.env.R2_BUCKET_NAME) {
      try {
        const fileContent = fs.readFileSync(req.file.path);
        const fileName = `uploads/${Date.now()}-${req.file.filename}`;
        
        const command = new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: fileName,
          Body: fileContent,
          ContentType: req.file.mimetype,
        });

        await s3Client.send(command);
        fs.unlinkSync(req.file.path); // delete local
        
        // Return the public URL
        const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${fileName}`;
        return res.json({ url: publicUrl });
      } catch (err) {
        console.error('R2 Error:', err);
        throw new Error(`Cloudflare R2 Upload Failed: ${err.message}. Please check your R2 API keys and Bucket name.`);
      }
    }

    // 2. Fallback to Cloudinary
    if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'dnshoppy',
          resource_type: 'auto' // Supports images and videos
        });
        fs.unlinkSync(req.file.path); // delete local
        return res.json({ url: result.secure_url });
      } catch (err) {
        console.error('Cloudinary Error:', err);
        throw new Error('Cloudinary upload failed: ' + (err.message || 'Unknown error'));
      }
    }

    // 2. Fallback to ImgBB
    const imgbbKey = process.env.IMGBB_API_KEY;
    if (imgbbKey) {
      const fileData = fs.readFileSync(req.file.path, { encoding: 'base64' });
      const boundary = '----WebKitFormBoundary' + Math.random().toString(16).substring(2);
      
      const postData = `--${boundary}\r\n` +
                       `Content-Disposition: form-data; name="key"\r\n\r\n` +
                       `${imgbbKey}\r\n` +
                       `--${boundary}\r\n` +
                       `Content-Disposition: form-data; name="image"\r\n\r\n` +
                       `${fileData}\r\n` +
                       `--${boundary}--\r\n`;

      const options = {
        hostname: 'api.imgbb.com',
        path: '/1/upload',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      await new Promise((resolve, reject) => {
        const request = https.request(options, (response) => {
          let data = '';
          response.on('data', chunk => data += chunk);
          response.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.success) {
                fs.unlinkSync(req.file.path);
                res.json({ url: result.data.url });
                resolve();
              } else {
                reject(new Error(result.error?.message || 'ImgBB upload failed'));
              }
            } catch (e) {
              reject(e);
            }
          });
        });

        request.on('error', (e) => reject(e));
        request.write(postData);
        request.end();
      });

      return;
    }

    // 3. Fallback: Local upload
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
    
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload file' });
  }
});

// ==========================================
// MOBILE TO LAPTOP UPLOAD SESSION LOGIC
// ==========================================
const mobileUploadSessions = new Map();

// Polled by the laptop
router.get('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!mobileUploadSessions.has(sessionId)) {
    return res.json({ status: 'pending' });
  }
  
  const data = mobileUploadSessions.get(sessionId);
  if (data.status === 'completed') {
    // We optionally remove the session after retrieving to clean up memory
    mobileUploadSessions.delete(sessionId);
    return res.json({ status: 'completed', urls: data.urls });
  }
  
  res.json({ status: 'pending' });
});

// Hit by the mobile phone after uploading to Cloudinary/ImgBB
router.post('/session/:sessionId', express.json(), (req, res) => {
  const { sessionId } = req.params;
  const { urls } = req.body;
  
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'Valid urls array is required' });
  }

  mobileUploadSessions.set(sessionId, { status: 'completed', urls });
  res.json({ success: true, message: 'Sent to laptop successfully' });
});

module.exports = router;
