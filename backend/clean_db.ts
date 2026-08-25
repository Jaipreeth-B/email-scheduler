import 'dotenv/config';
import prisma from './src/prismaClient';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
const emailQueue = new Queue('email-queue', {
  connection: new Redis(process.env.REDIS_URL as string, { maxRetriesPerRequest: null })
});

async function cleanAll() {
  console.log("🧹 Starting complete database and queue cleanup...");

  // 1. Delete all Campaigns (this will cascade and delete all EmailJobs as well!)
  const deletedCampaigns = await prisma.campaign.deleteMany();
  console.log(`✅ Deleted ${deletedCampaigns.count} campaigns and all their associated emails from the Database.`);

  // 2. Wipe the entire Redis BullMQ queue (pending, delayed, active, completed, failed)
  await emailQueue.obliterate({ force: true });
  console.log(`✅ Cleared all jobs from the Redis queue.`);

  console.log("🎉 Cleanup complete! Your system is completely fresh.");
}

cleanAll()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await emailQueue.close();
    process.exit(0);
  });
