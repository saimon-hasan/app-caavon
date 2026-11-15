// API tests against a real MongoDB database.
// Run from the server folder:  MONGODB_URI_TEST="mongodb://..." npm test
// Uses a separate "caavon_test" database so your real data is never touched.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { connectToDatabase, closeDatabase } = require('../db');
const { loadCatalog, seedProducts } = require('../seed');
const app = require('../app');

const TEST_URI = process.env.MONGODB_URI_TEST;
const skip = TEST_URI ? false : 'set MONGODB_URI_TEST to run the API tests';
const catalog = loadCatalog();
let server;
let baseUrl;

before(async () => {
  if (skip) return;
  const db = await connectToDatabase(TEST_URI, 'caavon_test');
  await seedProducts(db, catalog);
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  await new Promise(resolve => server.close(resolve));
  await closeDatabase();
});

const get = async (path) => {
  const response = await fetch(baseUrl + path);
  return { status: response.status, body: await response.json() };
};

test('health check reports the database as connected', { skip }, async () => {
  const { status, body } = await get('/api/health');
  assert.equal(status, 200);
  assert.equal(body.database, 'connected');
});

test('GET /api/products returns the whole catalog in its original order', { skip }, async () => {
  const { status, body } = await get('/api/products');
  assert.equal(status, 200);
  assert.deepEqual(body.map(p => p.id), catalog.map(p => p.id));
  assert.equal(body[0]._id, undefined, 'internal MongoDB _id is hidden');
  assert.equal(body[0].position, undefined, 'internal position field is hidden');
});

test('gender=kids returns only kids products', { skip }, async () => {
  const { body } = await get('/api/products?gender=kids');
  const expected = catalog.filter(p => p.gender === 'kids').length;
  assert.equal(body.length, expected);
  assert.ok(body.every(p => p.gender === 'kids'));
});

test('gender=women includes unisex pieces, like the website', { skip }, async () => {
  const { body } = await get('/api/products?gender=women');
  const expected = catalog.filter(p => p.gender === 'women' || p.gender === 'unisex').length;
  assert.equal(body.length, expected);
});

test('sale=true returns only sale products', { skip }, async () => {
  const { body } = await get('/api/products?sale=true');
  assert.equal(body.length, catalog.filter(p => p.isSale).length);
  assert.ok(body.every(p => p.isSale === true));
});

test('an unknown gender is rejected with 400', { skip }, async () => {
  const { status } = await get('/api/products?gender=pets');
  assert.equal(status, 400);
});

test('GET /api/products/:id returns one product, or 404', { skip }, async () => {
  const found = await get('/api/products/k2');
  assert.equal(found.status, 200);
  assert.equal(found.body.name, catalog.find(p => p.id === 'k2').name);

  const missing = await get('/api/products/does-not-exist');
  assert.equal(missing.status, 404);
});

test('seeding twice does not create duplicates', { skip }, async () => {
  const db = await connectToDatabase();
  const result = await seedProducts(db, catalog);
  assert.equal(result.seeded, catalog.length);
  assert.equal(await db.collection('products').countDocuments(), catalog.length);
});
