const { MongoClient } = require('mongodb');

let client = null;
let db = null;

// Connect once and reuse the same connection for every request.
async function connectToDatabase(
  uri = process.env.MONGODB_URI,
  dbName = process.env.MONGODB_DB || 'caavon'
) {
  if (db) return db;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy server/.env.example to server/.env and add your connection string.');
  }

  client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(dbName);
  return db;
}

// Returns the connected database, or null when the server runs without MongoDB.
function getDb() {
  return db;
}

async function closeDatabase() {
  if (client) await client.close();
  client = null;
  db = null;
}

module.exports = { connectToDatabase, getDb, closeDatabase };
