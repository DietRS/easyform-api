// /easyform-api/api/forms.js
const { MongoClient, ObjectId } = require('mongodb');

console.log('API: forms.js loaded at', new Date().toISOString());

module.exports = async (req, res) => {
  console.log('API: /api/forms invoked, method=', req.method, 'time=', new Date().toISOString());

  // Temporary CORS for testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const rawUri = process.env.MONGO_URI || '';
  console.log('API: MONGO_URI present:', rawUri.startsWith('mongodb') ? 'yes' : 'no');

  // Helper to connect (no legacy options)
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

  // POST: create a form
  if (req.method === 'POST') {
    const body = req.body || {};
    const title = body.title || 'Untitled';
    const data = body.data || {};

    try {
      const result = await withClient(async (db) => {
        const forms = db.collection('forms');
        const newForm = {
          title,
          data,
          createdAt: new Date(),
          approved: false,
          companyId: null
        };
        return await forms.insertOne(newForm);
      });

      console.log('API: Form inserted id=', result.insertedId);
      return res.status(201).json({ success: true, formId: result.insertedId.toString() });
    } catch (err) {
      console.error('API: Mongo error (forms POST):', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    }
  }

  // PUT: approve and link form to company
  if (req.method === 'PUT') {
    const body = req.body || {};
    const formId = body.formId;
    const companyId = body.companyId;

    if (!formId || !companyId) {
      return res.status(400).json({ error: 'missing_fields', message: 'formId and companyId required' });
    }

    try {
      const updateForm = await withClient(async (db) => {
        const forms = db.collection('forms');
        const companies = db.collection('companies');

        const updated = await forms.findOneAndUpdate(
          { _id: new ObjectId(formId) },
          { $set: { approved: true, companyId: new ObjectId(companyId), approvedAt: new Date() } },
          { returnDocument: 'after' }
        );

        if (!updated.value) return null;

        await companies.updateOne(
          { _id: new ObjectId(companyId) },
          { $addToSet: { approvedForms: new ObjectId(formId) } }
        );

        return updated.value;
      });

      if (!updateForm) return res.status(404).json({ error: 'not_found', message: 'form not found' });

      console.log('API: Form approved and linked to company', formId, companyId);
      return res.status(200).json({ success: true, form: updateForm });
    } catch (err) {
      console.error('API: Mongo error (forms PUT):', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' });
};
