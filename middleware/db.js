const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ─── Connection States ───
let admin = null;
let db = null;
let pgPool = null;
let isFirebase = false;

// 1. Try Postgres (Neon) First
if (process.env.DATABASE_URL) {
  try {
    let connStr = process.env.DATABASE_URL;
    if (connStr.includes('?sslmode=')) {
      connStr = connStr.split('?sslmode=')[0];
    }
    pgPool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 20, // Max number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
    });

    pgPool.on('error', (err) => {
      console.error('🔥 Unexpected error on idle client', err);
    });
    
    // Initialize JSONB Document Store Table
    pgPool.query(`
      CREATE TABLE IF NOT EXISTS dn_store (
        collection VARCHAR(50),
        id VARCHAR(100),
        data JSONB,
        PRIMARY KEY (collection, id)
      )
    `).then(() => {
      // Add performance indexes for high-traffic queries
      return pgPool.query(`
        CREATE INDEX IF NOT EXISTS idx_dn_store_collection ON dn_store (collection);
        CREATE INDEX IF NOT EXISTS idx_orders_email ON dn_store ((data->>'email')) WHERE collection = 'orders';
        CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON dn_store ((data->'customer'->>'email')) WHERE collection = 'orders';
        CREATE INDEX IF NOT EXISTS idx_orders_status ON dn_store ((data->>'orderStatus')) WHERE collection = 'orders';
        CREATE INDEX IF NOT EXISTS idx_orders_date ON dn_store ((data->>'date')) WHERE collection = 'orders';
        CREATE INDEX IF NOT EXISTS idx_products_status ON dn_store ((data->>'status')) WHERE collection = 'products';
      `);
    }).catch(err => console.error("⚠️ Postgres init error:", err.message));
    
    console.log("🐘 Connected to Neon Postgres (JSONB Mode)");
  } catch (err) {
    console.error("⚠️ Failed to connect to Postgres:", err.message);
  }
} 
// 2. Fallback to Firebase
else {
  try {
    admin = require('firebase-admin');
    const serviceAccountPath = path.join(__dirname, '..', 'firebase-key.json');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      db = admin.firestore();
      isFirebase = true;
      console.log("🔥 Connected to Firebase Firestore");
    } else {
      console.log("⚠️ No Postgres DB and no firebase-key.json found. Falling back to local JSON files.");
    }
  } catch (err) {
    console.log("⚠️ Firebase admin not installed or error initializing. Falling back to local JSON files.");
  }
}


// ─── Local File Fallback logic ───
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbFile = (name) => path.join(dataDir, `${name}.json`);

const readLocalDb = (name) => {
  const file = dbFile(name);
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return []; }
};
const writeLocalDb = (name, data) => {
  fs.writeFileSync(dbFile(name), JSON.stringify(data, null, 2), 'utf8');
};


// ─── Asynchronous DB Methods (Postgres -> Firebase -> Local Fallback) ───

const getCollection = async (collectionName) => {
  if (pgPool) {
    const res = await pgPool.query('SELECT id, data FROM dn_store WHERE collection = $1', [collectionName]);
    return res.rows.map(r => ({ id: r.id, ...r.data }));
  }
  if (isFirebase) {
    const snapshot = await db.collection(collectionName).get();
    const items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    return items;
  }
  return readLocalDb(collectionName);
};

const getDoc = async (collectionName, id) => {
  if (pgPool) {
    const res = await pgPool.query('SELECT data FROM dn_store WHERE collection = $1 AND id = $2', [collectionName, String(id)]);
    if (res.rows.length === 0) return null;
    return { id: String(id), ...res.rows[0].data };
  }
  if (isFirebase) {
    const doc = await db.collection(collectionName).doc(String(id)).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }
  const items = readLocalDb(collectionName);
  return items.find(i => String(i.id) === String(id)) || null;
};

const addDoc = async (collectionName, docData, customId = null) => {
  const id = customId || Date.now().toString();
  
  if (pgPool) {
    await pgPool.query('INSERT INTO dn_store (collection, id, data) VALUES ($1, $2, $3)', [collectionName, String(id), docData]);
    return { id, ...docData };
  }
  if (isFirebase) {
    if (customId) {
      await db.collection(collectionName).doc(String(customId)).set(docData);
      return { id: customId, ...docData };
    } else {
      const docRef = await db.collection(collectionName).add(docData);
      return { id: docRef.id, ...docData };
    }
  }
  const items = readLocalDb(collectionName);
  const newItem = { id, ...docData };
  items.unshift(newItem); // Add to beginning
  writeLocalDb(collectionName, items);
  return newItem;
};

const setDoc = async (collectionName, id, docData) => {
  if (pgPool) {
    await pgPool.query(`
      INSERT INTO dn_store (collection, id, data) 
      VALUES ($1, $2, $3) 
      ON CONFLICT (collection, id) 
      DO UPDATE SET data = dn_store.data || EXCLUDED.data
    `, [collectionName, String(id), docData]);
    return { id: String(id), ...docData };
  }
  if (isFirebase) {
    await db.collection(collectionName).doc(String(id)).set(docData, { merge: true });
    return { id, ...docData };
  }
  const items = readLocalDb(collectionName);
  const index = items.findIndex(i => String(i.id) === String(id));
  if (index !== -1) {
    items[index] = { ...items[index], ...docData };
  } else {
    items.push({ id, ...docData });
  }
  writeLocalDb(collectionName, items);
  return { id, ...docData };
};

const deleteDoc = async (collectionName, id) => {
  if (pgPool) {
    await pgPool.query('DELETE FROM dn_store WHERE collection = $1 AND id = $2', [collectionName, String(id)]);
    return true;
  }
  if (isFirebase) {
    await db.collection(collectionName).doc(String(id)).delete();
    return true;
  }
  let items = readLocalDb(collectionName);
  items = items.filter(i => String(i.id) !== String(id));
  writeLocalDb(collectionName, items);
  return true;
};

module.exports = {
  isFirebase,
  pgPool,
  getCollection,
  getDoc,
  addDoc,
  setDoc,
  deleteDoc,
  // Keep these for backward compatibility during migration
  readDb: readLocalDb,
  writeDb: writeLocalDb
};
