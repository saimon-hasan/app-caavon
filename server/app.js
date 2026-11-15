const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const { connectToDatabase, getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(__dirname, '../public');
const GENDERS = ['women', 'men', 'kids', 'unisex'];
const HIDDEN_FIELDS = { projection: { _id: 0, position: 0 } };

// Parse JSON requests.
app.use(express.json());

// Answers 503 when the server was started without a database.
function requireDatabase(req, res, next) {
  if (!getDb()) {
    return res.status(503).json({ error: 'Database not configured' });
  }
  next();
}

// Health check: server status plus database status.
app.get('/api/health', async (req, res) => {
  let database = 'not configured';
  if (getDb()) {
    try {
      await getDb().command({ ping: 1 });
      database = 'connected';
    } catch {
      database = 'unreachable';
    }
  }
  res.json({
    status: 'ok',
    database,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/products
// Optional filters: ?gender=women|men|kids|unisex  ?sale=true  ?category=dresses
// Women and men also include unisex pieces, the same as the website.
app.get('/api/products', requireDatabase, async (req, res, next) => {
  try {
    const filter = {};
    const { gender, sale, category } = req.query;

    if (gender !== undefined) {
      if (!GENDERS.includes(gender)) {
        return res.status(400).json({ error: `gender must be one of: ${GENDERS.join(', ')}` });
      }
      filter.gender = gender === 'women' || gender === 'men' ? { $in: [gender, 'unisex'] } : gender;
    }
    if (sale === 'true') filter.isSale = true;
    if (typeof category === 'string' && category) filter.category = category;

    const products = await getDb()
      .collection('products')
      .find(filter, HIDDEN_FIELDS)
      .sort({ position: 1 })
      .toArray();
    res.json(products);
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:id
app.get('/api/products/:id', requireDatabase, async (req, res, next) => {
  try {
    const product = await getDb().collection('products').findOne({ id: req.params.id }, HIDDEN_FIELDS);
    if (!product) {
      return res.status(404).json({ error: 'Product not found', id: req.params.id });
    }
    res.json(product);
  } catch (error) {
    next(error);
  }
});

// Serve public/index.html, styles.css, app.js, and products.json.
app.use(express.static(publicPath));

// Handle missing files and routes.
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Handle server errors.
app.use((err, req, res, next) => {
  console.error('Server error:', err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: 'Internal Server Error',
  });
});

// Start the server when this file is run directly.
async function start() {
  if (process.env.MONGODB_URI) {
    try {
      const db = await connectToDatabase();
      console.log(`Connected to MongoDB database "${db.databaseName}"`);
    } catch (error) {
      console.error(`Could not connect to MongoDB: ${error.message}`);
      process.exitCode = 1;
      return;
    }
  } else {
    console.warn('MONGODB_URI is not set: /api/products is off and the site uses public/products.json.');
  }

  const server = app.listen(PORT, () => {
    console.log(`CAAVON running at http://localhost:${PORT}`);
    console.log(`Serving files from: ${publicPath}`);
  });

  server.on('error', (err) => {
    console.error(`Could not start server: ${err.message}`);
    process.exitCode = 1;
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
