import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.local') });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI is required — copy .env.example to .env.local and fill it in');
  process.exit(1);
}

const client = new MongoClient(MONGO_URI);

try {
  await client.connect();
  const db = client.db('job_search');

  const noRecruiters = await db.collection('recruiters').find({ name: 'No Recruiter' }).toArray();
  console.log(`Found ${noRecruiters.length} "No Recruiter" record(s)`);

  if (noRecruiters.length === 0) {
    console.log('Nothing to do.');
  } else {
    const ids = noRecruiters.map((r) => r._id);

    const jobResult = await db.collection('jobs').updateMany(
      { recruiterId: { $in: ids } },
      { $set: { recruiterId: '' } },
    );
    console.log(`Cleared recruiterId on ${jobResult.modifiedCount} job(s)`);

    const recruiterResult = await db.collection('recruiters').deleteMany({ _id: { $in: ids } });
    console.log(`Deleted ${recruiterResult.deletedCount} "No Recruiter" record(s)`);
  }
} finally {
  await client.close();
}
