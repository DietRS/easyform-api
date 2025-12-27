// /easyform-api/api/forms.js
// Handler for creating, listing, fetching, and updating form definitions

const { MongoClient } = require('mongodb');

console.log('API: forms.js loaded at', new Date().toISOString());

module.exports = async (req, res) => {
  console.log('API: /api/forms invoked, method=', req.method, 'time=', new Date().toISOString());

  // CORS (temporary / dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const rawUri = process.env.MONGO_URI || '';
  console.log('API: MONGO_URI present:', rawUri.startsWith('mongodb') ? 'yes' : 'no');

  async function withClient(fn) {
    let client;
    try {
      client = new MongoClient(process.env.MONGO_URI);
      await client.connect();
      console.log('API: Mongo connected (forms)');
      const db = client.db();
      return await fn(db);
    } finally {
      if (client) await client.close();
    }
  }

  // Helper: normalize a form object from request body
  function normalizeForm(body, existingId) {
    const form = body || {};

    const title = (form.title || '').trim() || 'Untitled Form';
    const description = (form.description || '').trim();
    const category = (form.category || '').trim();
    const active = form.active !== undefined ? !!form.active : true;
    const fields = Array.isArray(form.fields) ? form.fields : [];

    // ID logic: if body._id provided, use it; else auto-generate from title
    let id = form._id || existingId || '';
    if (!id) {
      id =
        'form_' +
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
    }

    return {
      _id: id,          // string ID, human-readable
      title,
      description,
      category,
      active,
      fields,
    };
  }

  // ---------------------------
  // GET /api/forms or /api/forms?id=FORM_ID
  // ---------------------------
  if (req.method === 'GET') {
    try {
      const hasId = req.query && req.query.id;

      if (hasId) {
        const id = req.query.id;

        const doc = await withClient(async (db) => {
          const forms = db.collection('forms');
          return await forms.findOne({ _id: id });
        });

        if (!doc) return res.status(404).json({ error: 'not_found' });

        return res.status(200).json({ success: true, form: doc });
      }

      // List all forms
      const docs = await withClient(async (db) => {
        const forms = db.collection('forms');
        return await forms.find({}).sort({ createdAt: -1 }).limit(200).toArray();
      });

      return res.status(200).json({ success: true, forms: docs });
    } catch (err) {
      console.error('API: Mongo error (forms GET):', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    }
  }

  // ---------------------------
  // POST /api/forms (create)
  // ---------------------------
  if (req.method === 'POST') {
    const body = req.body || {};
    const normalized = normalizeForm(body);

    try {
      const created = await withClient(async (db) => {
        const forms = db.collection('forms');

        // Make sure we don't overwrite accidentally
        const existing = await forms.findOne({ _id: normalized._id });
        if (existing) {
          return { conflict: true, existing };
        }

        const doc = {
          ...normalized,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await forms.insertOne(doc);
        return { doc };
      });

      if (created.conflict) {
        return res.status(409).json({
          error: 'conflict',
          message: `Form with id ${normalized._id} already exists`,
        });
      }

      console.log('API: Form created id=', normalized._id);
      return res.status(201).json({ success: true, form: created.doc });
    } catch (err) {
      console.error('API: Mongo error (forms POST):', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    }
  }

  // ---------------------------
  // PUT /api/forms?id=FORM_ID (update)
  // ---------------------------
  if (req.method === 'PUT') {
    if (!req.query || !req.query.id) {
      return res.status(400).json({ error: 'missing_id', message: 'Form id is required in query string' });
    }

    const id = req.query.id;
    const body = req.body || {};
    const normalized = normalizeForm(body, id);

    try {
      const updated = await withClient(async (db) => {
        const forms = db.collection('forms');

        const result = await forms.findOneAndUpdate(
          { _id: id },
          {
            $set: {
              title: normalized.title,
              description: normalized.description,
              category: normalized.category,
              active: normalized.active,
              fields: normalized.fields,
              updatedAt: new Date(),
            },
          },
          { returnDocument: 'after' }
        );

        return result.value;
      });

      if (!updated) {
        return res.status(404).json({ error: 'not_found', message: 'Form not found' });
      }

      console.log('API: Form updated id=', id);
      return res.status(200).json({ success: true, form: updated });
    } catch (err) {
      console.error('API: Mongo error (forms PUT):', err);
      return res.status(500).json({ error: 'db_error', message: err.message });
    }
  }

  // ---------------------------
  // Other methods
  // ---------------------------
  return res.status(405).json({ error: 'method_not_allowed' });
};
