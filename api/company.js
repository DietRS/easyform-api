// /easyform-api/api/company.js
// Serverless handler with logging, CORS, GET (list + by id), POST, PUT (update)

const { MongoClient, ObjectId } = require('mongodb');

console.log('API: company.js loaded at', new Date().toISOString());

module.exports = async (req, res) => {
  console.log('API: /api/company invoked, method=', req.method, 'time=', new Date().toISOString());

  // --- CORS (temporary for testing) ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Quick check for MONGO_URI presence (masked)
  const rawUri = process.env.MONGO_URI || '';
  console.log('API: MONGO_URI present:', rawUri.startsWith('mongodb') ? 'yes' : 'no');

  // Helper to connect
  async function withClient(fn) {
    let client;
    try {
      client = new MongoClient(process.env.MONGO_URI);
      await client.connect();
      console.log('API: Mongo connected');
      const db = client.db();
      return await fn(db);
    } finally {
      if (client) await client.close();
    }
  }

  // ---------------------------
  // GET /api/company or /api/company?id=...
  // ---------------------------
  if (req.method === 'GET') {
    try {
      // If ?id present → single company
      if (req.query && req.query.id) {
        const id = req.query.id;
        let filter;

        // Allow both string IDs and ObjectId-like IDs
        if (ObjectId.isValid(id)) {
          filter = { _id: new ObjectId(id) };
        } else {
          // Fallback: if you ever decide to use string _id for companies
          filter = { _id: id };
        }

        const doc = await withClient(async (db) => {
          const companies = db.collection('companies');
          return await companies.findOne(filter);
        });

        if (!doc) return res.status(404).json({ error: 'not_found' });

        return res.status(200).json({ success: true, company: doc });
      }

      // Else → list companies (limited)
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

  // ---------------------------
  // POST /api/company  (create)
  // ---------------------------
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
          approvedForms: body.approvedForms || [],   // array of form IDs (strings)
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

  // ---------------------------
  // PUT /api/company?id=... (update)
  // ---------------------------
  if (req.method === 'PUT') {
    if (!req.query || !req.query.id) {
      return res.status(400).json({ error: 'missing_id', message: 'Company id is required in query string' });
    }

    const id = req.query.id;
    const body = req.body || {};

    // We allow updating any top-level fields, but common ones are:
    // - name
    // - email
    // - metadata
    // - approvedForms (array of form IDs)
    const updateDoc = {};
    ['name', 'email', 'metadata', 'approvedForms'].forEach((key) => {
      if (body[key] !== undefined) updateDoc[key] = body[key];
    });

    if (Object.keys(updateDoc).length === 0) {
      return res.status(400).json({ error: 'no_fields', message: 'No updatable fields provided' });
    }

    try {
      const updated = await withClient(async (db) => {
        const companies = db.collection('companies');

        let filter;
        if (ObjectId.isValid(id)) {
          filter = { _id: new ObjectId(id) };
        } else {
          filter = { _id: id };
        }

        const result = await companies.findOneAndUpdate(
          filter,
          { $set: updateDoc },
          { returnDocument: 'after' }
        );
        return result.value;
      });

      if (!updated) {
        return res.status(404).json({ error: 'not_found', message: 'Company not found' });
      }

      return res.status(200).json({ success: true, company: updated });
    } catch (err) {
      console.error('API: Mongo error (PUT):', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    }
  }

  // ---------------------------
  // Other methods
  // ---------------------------
  return res.status(405).json({ error: 'method_not_allowed' });
};
