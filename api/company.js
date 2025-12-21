import { MongoClient } from "mongodb";

let cachedClient = null;

async function connectToDB() {
  if (cachedClient) return cachedClient;

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const client = await connectToDB();
    const db = client.db("easyform");
    const companies = db.collection("companies");

    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const company = await companies.insertOne({
      name,
      email,
      createdAt: new Date()
    });

    res.status(200).json({ success: true, id: company.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
