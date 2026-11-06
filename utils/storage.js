const cloudinary = require('cloudinary').v2;
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// ─── Configure Cloudinary (Legacy) ───
if (process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) {
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  }
}

// ─── Configure Cloudflare R2 ───
let s3Client = null;
if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
  });
}

function extractPublicId(url) {
  if (!url || typeof url !== 'string') return null;
  const clean = url.split('?')[0];
  const uploadIdx = clean.indexOf('/upload/');
  if (uploadIdx === -1) return null;
  const afterUpload = clean.substring(uploadIdx + 8);
  const parts = afterUpload.split('/');
  
  const nonTransformParts = [];
  let foundVersionOrPublic = false;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!foundVersionOrPublic) {
      if (/^v\d+$/.test(part)) {
        foundVersionOrPublic = true;
        continue;
      }
      if (part.includes(',') || part.startsWith('w_') || part.startsWith('h_') || part.startsWith('c_') || part.startsWith('f_') || part.startsWith('q_')) {
        continue;
      }
    }
    nonTransformParts.push(part);
  }
  const fileWithExt = nonTransformParts.join('/');
  return fileWithExt.substring(0, fileWithExt.lastIndexOf('.')) || fileWithExt;
}

/**
 * Checks the image URL and deletes it from the respective storage provider
 */
const deleteImage = async (imageUrl) => {
  try {
    if (!imageUrl || typeof imageUrl !== 'string') return;
    
    // 1. Delete from Cloudinary
    if (imageUrl.includes('res.cloudinary.com')) {
      const publicId = extractPublicId(imageUrl);
      if (!publicId) return;

      // Detect account dynamically from URL
      let targetCloud = process.env.CLOUDINARY_CLOUD_NAME || 'uje56pqa';
      let apiKey = process.env.CLOUDINARY_API_KEY || '361622763294372';
      let apiSecret = process.env.CLOUDINARY_API_SECRET || 'j5ODN9YzFj11SAqB8xwYzK0zmtQ';

      if (imageUrl.includes('/p0cbzhw6/')) {
        targetCloud = 'p0cbzhw6';
        apiKey = '454734555652622';
        apiSecret = '8_L4tq_O8yOwRxiMO8VgQ5TAeMs';
      } else if (imageUrl.includes('/uje56pqa/')) {
        targetCloud = 'uje56pqa';
        apiKey = '361622763294372';
        apiSecret = 'j5ODN9YzFj11SAqB8xwYzK0zmtQ';
      }

      const res = await cloudinary.uploader.destroy(publicId, {
        cloud_name: targetCloud,
        api_key: apiKey,
        api_secret: apiSecret,
        invalidate: true
      });
      console.log(`Cloudinary image deleted: ${publicId} from ${targetCloud} ->`, res.result);
      return;
    }

    // 2. Delete from Cloudflare R2
    if (process.env.R2_PUBLIC_URL && imageUrl.startsWith(process.env.R2_PUBLIC_URL)) {
      if (!s3Client) return;
      
      // Extract the object key from the public URL
      const objectKey = imageUrl.replace(process.env.R2_PUBLIC_URL, '').replace(/^\//, '');
      
      const command = new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: objectKey,
      });

      await s3Client.send(command);
      console.log(`Deleted R2 image: ${objectKey}`);
      return;
    }

  } catch (error) {
    console.error('Failed to delete image:', error.message);
  }
};

module.exports = { deleteImage, s3Client };
