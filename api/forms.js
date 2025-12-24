// /easyform-api/api/forms.js
// Create forms and mark them approved for a company

const { MongoClient, ObjectId } = require('mongodb');

module.exports = async (req, res) => {
  // CORS (temporary for testing)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  console.log('API: /api/forms invoked, method=', req.method);

  const rawUri = process.env.MONGO_URI || '';
  console.log('API: MONGO_URI present:', rawUri.startsWith('mongodb') ? 'yes' : 'no');

  // POST: create a form (unapproved by default)
  if (req.method === 'POST') {
    const body = req.body || {};
    const title = body.title || 'Untitled';
    const data = body.data || {};

    let client;
    try {
      client = new MongoClient(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
      await client.connect();
      const db = client.db();
      const forms = db.collection('forms');

      const newForm = {
        title,
        data,
        createdAt: new Date(),
        approved: false,
        companyId: null
      };

      const result = await forms.insertOne(newForm);
      console.log('API: Form inserted id=', result.insertedId);
      return res.status(201).json({ success: true, formId: result.insertedId.toString() });
    } catch (err) {
      console.error('API: Mongo error (forms POST):', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    } finally {
      if (client) await client.close();
    }
  }

  // PUT: approve a form and link to a company
  if (req.method === 'PUT') {
    const body = req.body || {};
    const formId = body.formId;
    const companyId = body.companyId;

    if (!formId || !companyId) {
      return res.status(400).json({ error: 'missing_fields', message: 'formId and companyId required' });
    }

    let client;
    try {
      client = new MongoClient(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
      await client.connect();
      const db = client.db();
      const forms = db.collection('forms');
      const companies = db.collection('companies');

      // Mark form approved and set companyId
      const updateForm = await forms.findOneAndUpdate(
        { _id: new ObjectId(formId) },
        { $set: { approved: true, companyId: new ObjectId(companyId), approvedAt: new Date() } },
        { returnDocument: 'after' }
      );

      if (!updateForm.value) {
        return res.status(404).json({ error: 'not_found', message: 'form not found' });
      }

      // Add form id to company's approvedForms array
      await companies.updateOne(
        { _id: new ObjectId(companyId) },
        { $addToSet: { approvedForms: new ObjectId(formId) } }
      );

      console.log('API: Form approved and linked to company', formId, companyId);
      return res.status(200).json({ success: true, form: updateForm.value });
    } catch (err) {
      console.error('API: Mongo error (forms PUT):', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    } finally {
      if (client) await client.close();
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' });
};
