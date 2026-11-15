// Copies public/products.json into the MongoDB "products" collection.
// Safe to run more than once: products are matched by id and replaced.
// Usage (from the server folder): npm run seed

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { connectToDatabase, closeDatabase } = require('./db');

const CATALOG_PATH = path.join(__dirname, '../public/products.json');

function loadCatalog(filePath = CATALOG_PATH) {
  const products = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(products)) throw new Error('products.json must contain an array.');

  const ids = new Set();
  products.forEach((product, index) => {
    const valid = product
      && typeof product.id === 'string'
      && !ids.has(product.id)
      && typeof product.name === 'string'
      && typeof product.price === 'number'
      && Number.isFinite(product.price)
      && product.price >= 0
      && Array.isArray(product.images) && product.images.length > 0
      && Array.isArray(product.sizes)
      && Array.isArray(product.colors)
      && Array.isArray(product.care);
    if (!valid) throw new Error(`Product at position ${index} has missing, invalid, or duplicate fields.`);
    ids.add(product.id);
  });
  return products;
}

async function seedProducts(db, products = loadCatalog()) {
  const collection = db.collection('products');
  await collection.createIndex({ id: 1 }, { unique: true });

  // "position" keeps the same display order as products.json.
  await collection.bulkWrite(products.map((product, position) => ({
    replaceOne: {
      filter: { id: product.id },
      replacement: { ...product, position },
      upsert: true,
    },
  })));

  // Remove products that were deleted from products.json.
  const ids = products.map(product => product.id);
  const removed = await collection.deleteMany({ id: { $nin: ids } });

  return { seeded: products.length, removed: removed.deletedCount };
}

if (require.main === module) {
  (async () => {
    try {
      const db = await connectToDatabase();
      const { seeded, removed } = await seedProducts(db);
      console.log(`Seeded ${seeded} products into "${db.databaseName}.products" (removed ${removed} old ones).`);
    } catch (error) {
      console.error('Seeding failed:', error.message);
      process.exitCode = 1;
    } finally {
      await closeDatabase();
    }
  })();
}

module.exports = { loadCatalog, seedProducts };
