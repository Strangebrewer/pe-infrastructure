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

const NEW_USER_ID = '019e0381-8720-79b5-bfd7-559e3ce10f19';

const client = new MongoClient(MONGO_URI);

try {
  await client.connect();

  const oldDb = client.db('go-server');
  const newDb = client.db('job_search');

  // -------------------------------------------------------------------------
  // Migrate recruiters
  // -------------------------------------------------------------------------

  const oldRecruiters = await oldDb.collection('recruiters').find({}).toArray();
  console.log(`Found ${oldRecruiters.length} recruiter(s) to migrate`);

  const recruiterIdMap = new Map(); // old ObjectID hex → new UUID

  const newRecruiters = oldRecruiters.map((r) => {
    const newId = crypto.randomUUID();
    recruiterIdMap.set(r._id.toHexString(), newId);

    return {
      _id: newId,
      userId: NEW_USER_ID,
      name: r.name,
      company: r.company,
      phone: r.phone,
      email: r.email,
      rating: r.rating,
      comments: r.comments ?? [],
      archived: r.archived,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  if (newRecruiters.length > 0) {
    await newDb.collection('recruiters').insertMany(newRecruiters);
  }
  console.log(`Migrated ${newRecruiters.length} recruiter(s)`);

  // -------------------------------------------------------------------------
  // Migrate jobs
  // -------------------------------------------------------------------------

  const oldJobs = await oldDb.collection('jobs').find({}).toArray();
  console.log(`Found ${oldJobs.length} job(s) to migrate`);

  const newJobs = [];
  const skipped = [];

  for (const j of oldJobs) {
    const recruiterHex = j.recruiter?.toHexString();
    const recruiterId = recruiterIdMap.get(recruiterHex);

    if (!recruiterId) {
      console.warn(`Skipping job "${j.job_title}" (${j._id.toHexString()}) — recruiter ${recruiterHex} not found in migrated recruiters`);
      skipped.push(j._id.toHexString());
      continue;
    }

    newJobs.push({
      _id: crypto.randomUUID(),
      userId: NEW_USER_ID,
      recruiterId,
      jobTitle: j.job_title,
      workFrom: j.work_from,
      dateApplied: j.date_applied ? j.date_applied.slice(0, 10) : '',
      companyName: j.company_name,
      companyAddress: j.company_address,
      companyCity: j.company_city,
      companyState: j.company_state,
      pointOfContact: j.point_of_contact,
      pocTitle: j.poc_title,
      interviews: j.interviews ?? [],
      comments: j.comments ?? [],
      status: j.status,
      archived: j.archived,
      primaryLink: j.primary_link,
      primaryLinkText: j.primary_link_text,
      secondaryLink: j.secondary_link,
      secondaryLinkText: j.secondary_link_text,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  if (newJobs.length > 0) {
    await newDb.collection('jobs').insertMany(newJobs);
  }

  console.log(`Migrated ${newJobs.length} job(s)${skipped.length > 0 ? `, skipped ${skipped.length}` : ''}`);
} finally {
  await client.close();
}
