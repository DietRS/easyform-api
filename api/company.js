// /easyform-api/api/company.js
// Serverless handler with immediate logging, CORS for testing, GET and POST support

const { MongoClient, ObjectId } = require('mongodb');

console.log('API: company.js loaded at', new Date().toISOString());

module.exports = async (req, res) => {
  console.log('API: /api/company invoked, method=', req.method, 'time=', new Date().toISOString());

  // --- CORS (temporary for testing) ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Quick check for MONGO_URI presence (masked)
  const rawUri = process.env.MONGO_URI || '';
  console.log('API: MONGO_URI present:', rawUri.startsWith('mongodb') ? 'yes' : 'no');

  // Helper to connect
  async function withClient(fn) {
    let client;
    try {
      client = new MongoClient(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
      await client.connect();
      console.log('API: Mongo connected');
      const db = client.db(); // DB from URI
      return await fn(db);
    } finally {
      if (client) await client.close();
    }
  }

  // GET: list companies (safe, limited)
  if (req.method === 'GET') {
    try {
      const docs = await withClient(async (db) => {
        const companies = db.collection('companies');
        return await companies.find({}).limit(100).toArray();
      });
      return res.status(200).json({ success: true, companies: docs });
    } catch (err) {
      console.error('API: Mongo error (GET):', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    }
  }

  // POST: create a company
  if (req.method === 'POST') {
    const body = req.body || {};
    const name = body.name || '';
    const email = body.email || '';

    if (!name || !email) {
      return res.status(400).json({ error: 'missing_fields', message: 'name and email required' });
    }

    try {
      const result = await withClient(async (db) => {
        const companies = db.collection('companies');
        const newCompany = {
          name,
          email,
          createdAt: new Date(),
          approvedForms: [],
          metadata: body.metadata || {}
        };
        return await companies.insertOne(newCompany);
      });

      console.log('API: Company inserted id=', result.insertedId);
      return res.status(201).json({ success: true, id: result.insertedId.toString() });
    } catch (err) {
      console.error('API: Mongo error (POST):', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    }
  }

  // Other methods
  return res.status(405).json({ error: 'Method not allowed' });
};
