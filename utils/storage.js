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

/**
 * Checks the image URL and deletes it from the respective storage provider
 */
const deleteImage = async (imageUrl) => {
  try {
    if (!imageUrl) return;
    
    // 1. Delete from Cloudinary
    if (imageUrl.includes('res.cloudinary.com')) {
      const parts = imageUrl.split('/');
      const uploadIndex = parts.indexOf('upload');
      if (uploadIndex === -1) return;

      const afterUpload = parts.slice(uploadIndex + 1);
      if (afterUpload.length > 0 && afterUpload[0].match(/^v\d+$/)) {
        afterUpload.shift();
      }

      const fileWithExt = afterUpload.join('/');
      const publicId = fileWithExt.substring(0, fileWithExt.lastIndexOf('.'));

      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
        console.log(`Deleted Cloudinary image: ${publicId}`);
      }
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
