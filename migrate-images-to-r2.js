require('dotenv').config();
const { getCollection, setDoc } = require('./middleware/db');
const { s3Client } = require('./utils/storage');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function migrateImages() {
  if (!s3Client || !process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL) {
    console.error('❌ R2 Credentials are not set in .env');
    process.exit(1);
  }

  console.log('🚀 Starting Cloudinary to Cloudflare R2 Migration...');

  try {
    // Migrate Products
    const products = await getCollection('products');
    console.log(`📦 Found ${products.length} products to check.`);

    for (const product of products) {
      if (!product.images || !Array.isArray(product.images)) continue;
      
      let updated = false;
      const newImages = [];

      for (const imgUrl of product.images) {
        if (imgUrl.includes('res.cloudinary.com')) {
          console.log(`Downloading: ${imgUrl}`);
          try {
            const buffer = await downloadImage(imgUrl);
            const fileName = `uploads/migrated-${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`;
            
            await s3Client.send(new PutObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME,
              Key: fileName,
              Body: buffer,
              ContentType: 'image/jpeg'
            }));

            const r2Url = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${fileName}`;
            newImages.push(r2Url);
            updated = true;
            console.log(`✅ Uploaded to R2: ${r2Url}`);
          } catch (e) {
            console.error(`❌ Failed to migrate ${imgUrl}:`, e.message);
            newImages.push(imgUrl); // Keep old url if failed
          }
        } else {
          newImages.push(imgUrl); // Already migrated or different source
        }
      }

      if (updated) {
        product.images = newImages;
        await setDoc('products', product.id, product);
        console.log(`💾 Updated DB for product: ${product.name}`);
      }
    }

    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Fatal Error during migration:', error);
    process.exit(1);
  }
}

migrateImages();
