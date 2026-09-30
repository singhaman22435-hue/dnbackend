require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const dataDir = path.join(__dirname, 'data');

async function migrate() {
  console.log("🚀 Starting migration to Neon Postgres...");
  
  // Ensure table exists
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS dn_store (
      collection VARCHAR(50),
      id VARCHAR(100),
      data JSONB,
      PRIMARY KEY (collection, id)
    )
  `);

  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const collectionName = file.replace('.json', '');
    console.log(`📦 Migrating collection: ${collectionName}`);
    
    const filePath = path.join(dataDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) {
        for (const item of data) {
          if (!item.id) continue;
          
          const { id, ...docData } = item;
          
          await pgPool.query(`
            INSERT INTO dn_store (collection, id, data) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (collection, id) 
            DO UPDATE SET data = EXCLUDED.data
          `, [collectionName, String(id), docData]);
        }
        console.log(`✅ Successfully migrated ${data.length} documents for ${collectionName}`);
      }
    } catch (err) {
      console.error(`❌ Error migrating ${collectionName}:`, err.message);
    }
  }
  
  console.log("🎉 Migration complete!");
  process.exit(0);
}

migrate();
