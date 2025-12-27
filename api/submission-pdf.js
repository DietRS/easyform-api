// /easyform-api/api/submission-pdf.js
// Generate a PDF for a given submission

const { MongoClient, ObjectId } = require('mongodb');
const PDFDocument = require('pdfkit');

console.log('API: submission-pdf.js loaded at', new Date().toISOString());

module.exports = async (req, res) => {
  console.log('API: /api/submission-pdf invoked, method=', req.method, 'time=', new Date().toISOString());

  // Only GET
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const rawUri = process.env.MONGO_URI || '';
  console.log('API: MONGO_URI present:', rawUri.startsWith('mongodb') ? 'yes' : 'no');

  const submissionId = req.query && req.query.id;
  if (!submissionId) {
    return res.status(400).json({ error: 'missing_id', message: 'Submission id is required' });
  }

  async function withClient(fn) {
    let client;
    try {
      client = new MongoClient(process.env.MONGO_URI);
      await client.connect();
      console.log('API: Mongo connected (submission-pdf)');
      const db = client.db();
      return await fn(db);
    } finally {
      if (client) await client.close();
    }
  }

  try {
    const { submission, company, form } = await withClient(async (db) => {
      const submissionsCol = db.collection('submissions');
      const companiesCol = db.collection('companies');
      const formsCol = db.collection('forms');

      const sub = await submissionsCol.findOne({ _id: new ObjectId(submissionId) });
      if (!sub) throw new Error('submission_not_found');

      const comp = await companiesCol.findOne({ _id: new ObjectId(sub.companyId) });
      const frm = await formsCol.findOne({ _id: sub.formId });

      return { submission: sub, company: comp, form: frm };
    });

    // Set headers for PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="easyform-${submissionId}.pdf"`
    );

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    // Header
    doc
      .fontSize(20)
      .fillColor('#052A74')
      .text(company?.name || 'Company', { align: 'left' });

    doc
      .fontSize(12)
      .fillColor('#000000')
      .text(company?.metadata?.address || '', { align: 'left' });

    doc.moveDown();

    doc
      .fontSize(18)
      .fillColor('#000000')
      .text(form?.title || 'Form Submission', { align: 'left' });
    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .fillColor('#555555')
      .text(`Form ID: ${submission.formId}`, { align: 'left' });
    doc.text(`Submission ID: ${submission._id}`, { align: 'left' });
    doc.text(`Date: ${submission.createdAt.toISOString()}`, { align: 'left' });

    doc.moveDown();

    // Answers
    doc
      .fontSize(12)
      .fillColor('#000000')
      .text('Answers:', { underline: true });

    doc.moveDown(0.5);

    const answers = Array.isArray(submission.answers) ? submission.answers : [];
    answers.forEach((ans) => {
      const label = ans.label || ans.fieldId || 'Field';
      const value =
        ans.type === 'checkbox'
          ? ans.value
            ? 'Yes'
            : 'No'
          : ans.value == null
          ? ''
          : String(ans.value);

      doc
        .fontSize(11)
        .fillColor('#111827')
        .text(label + ':', { continued: true })
        .fillColor('#374151')
        .text(' ' + value);

      doc.moveDown(0.25);
    });

    doc.end();
  } catch (err) {
    console.error('API: PDF generation error:', err);
    if (!res.headersSent) {
      if (err.message === 'submission_not_found') {
        return res.status(404).json({ error: 'not_found', message: 'Submission not found' });
      }
      return res.status(500).json({ error: 'pdf_error', message: err.message });
    }
  }
};
