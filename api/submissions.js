// /easyform-api/api/submissions.js
// Store and fetch form submissions

const { MongoClient, ObjectId } = require('mongodb');

console.log('API: submissions.js loaded at', new Date().toISOString());

module.exports = async (req, res) => {
  console.log('API: /api/submissions invoked, method=', req.method, 'time=', new Date().toISOString());

  // CORS (dev-friendly; tighten later)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const rawUri = process.env.MONGO_URI || '';
  console.log('API: MONGO_URI present:', rawUri.startsWith('mongodb') ? 'yes' : 'no');

  async function withClient(fn) {
    let client;
    try {
      client = new MongoClient(process.env.MONGO_URI);
      await client.connect();
      console.log('API: Mongo connected (submissions)');
      const db = client.db();
      return await fn(db);
    } finally {
      if (client) await client.close();
    }
  }

  // =========
  // GET
  // =========
  // - /api/submissions?id=...       → single submission
  // - /api/submissions?companyId=...&formId=...  → list
  if (req.method === 'GET') {
    try {
      const { id, companyId, formId } = req.query || {};

      if (id) {
        const doc = await withClient(async (db) => {
          const submissions = db.collection('submissions');
          return await submissions.findOne({ _id: new ObjectId(id) });
        });

        if (!doc) return res.status(404).json({ error: 'not_found' });
        return res.status(200).json({ success: true, submission: doc });
      }

      // List submissions filtered by companyId / formId
      const filter = {};
      if (companyId) filter.companyId = companyId;
      if (formId) filter.formId = formId;

      const docs = await withClient(async (db) => {
        const submissions = db.collection('submissions');
        return await submissions
          .find(filter)
          .sort({ createdAt: -1 })
          .limit(200)
          .toArray();
      });

      return res.status(200).json({ success: true, submissions: docs });
    } catch (err) {
      console.error('API: Mongo error (submissions GET):', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    }
  }

  // =========
  // POST
  // =========
  // Body:
  // {
  //   companyId: string,
  //   formId: string,
  //   answers: [{ fieldId, label, type, value }]
  // }
  if (req.method === 'POST') {
    const body = req.body || {};
    const companyId = body.companyId || '';
    const formId = body.formId || '';
    const answers = Array.isArray(body.answers) ? body.answers : [];

    if (!companyId || !formId || !answers.length) {
      return res.status(400).json({
        error: 'missing_fields',
        message: 'companyId, formId and at least one answer are required',
      });
    }

    try {
      const result = await withClient(async (db) => {
        const submissions = db.collection('submissions');
        const doc = {
          companyId,
          formId,
          answers,
          createdAt: new Date(),
        };
        const r = await submissions.insertOne(doc);
        return { id: r.insertedId.toString(), doc: { ...doc, _id: r.insertedId } };
      });

      console.log('API: Submission stored id=', result.id);
      return res.status(201).json({ success: true, id: result.id });
    } catch (err) {
      console.error('API: Mongo error (submissions POST):', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' });
};
