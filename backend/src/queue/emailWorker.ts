import { Worker, Job, DelayedError } from 'bullmq';
import { config } from '../config';
import { EmailJobData } from './emailQueue';
import nodemailer from 'nodemailer';
import prisma from '../prismaClient';
import Redis from 'ioredis';

const redisOptions = config.redis.url?.startsWith('rediss://')
  ? { tls: { rejectUnauthorized: false } }
  : {};

// Shared Redis connection for rate limiting
const redis = config.redis.url
  ? new Redis(config.redis.url, redisOptions)
  : new Redis({
    host: config.redis.host,
    port: config.redis.port,
  });

// Helper to get rate limit key (scoped by sender + UTC hour)
function getRateLimitKey(senderEmail: string) {
  const now = new Date();
  const dateStr = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}-${now.getUTCHours()}`;
  return `rate_limit:${senderEmail}:${dateStr}`;
}

// Lua script for atomic rate limiting
// KEYS[1] = rate limit key
// ARGV[1] = hourly limit
// ARGV[2] = ttl in seconds
const rateLimitLua = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', key) or '0')

if current < limit then
  redis.call('INCR', key)
  if current == 0 then
    redis.call('EXPIRE', key, ttl)
  end
  return 1
end
return 0
`;

// Create an Ethereal transporter dynamically
async function createTransporter() {
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
}

// Cache transporter so we don't create a new account for every single email
let cachedTransporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = await createTransporter();
  }
  return cachedTransporter;
}

export const emailWorker = new Worker(
  'email-queue',
  async (job: Job<EmailJobData>) => {
    const data = job.data;
    const rateLimitKey = getRateLimitKey(data.senderEmail);

    // IDEMPOTENCY: Check DB status before doing anything
    const existingJob = await prisma.emailJob.findUnique({
      where: { id: data.jobId }
    });

    if (!existingJob) {
      console.warn(`Job ${data.jobId} not found in database. Skipping.`);
      return;
    }

    if (existingJob.status === 'SENT') {
      console.log(`Job ${data.jobId} was already sent. Skipping.`);
      return;
    }

    // Atomic rate limiting check
    // 3600 + 60 seconds (1 hour + 1 minute) TTL
    const allowed = await redis.eval(rateLimitLua, 1, rateLimitKey, data.hourlyLimit, 3660);

    if (allowed === 0) {
      // Delay until the start of the next UTC hour
      const now = new Date();
      const nextHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1, 0, 0, 0));
      const delayMs = nextHour.getTime() - now.getTime();

      console.log(`[Rate Limit] Sender ${data.senderEmail} reached limit. Delaying job ${job.id} by ${delayMs}ms.`);

      // Rescheduling using moveToDelayed preserves the job instead of dropping it.
      // Note: By pushing all rate-limited jobs to the exact start of the next hour,
      // they might bunch up and lose their relative delay spacing. 
      // BullMQ will execute them based on its concurrency limits.
      await job.moveToDelayed(Date.now() + delayMs, job.token!);
      throw new DelayedError(); // Tell BullMQ to halt processing for this job since it was delayed
    }

    // Transition to SENDING state before SMTP action
    // Note: This reduces the race window, but if the process crashes immediately 
    // after SMTP accepts it but before we update to SENT, the email may be sent twice upon recovery.
    // Exactly-once delivery cannot be strictly guaranteed with an external SMTP service and local DB.
    await prisma.emailJob.update({
      where: { id: data.jobId },
      data: { status: 'SENDING' }
    });

    try {
      const transporter = await getTransporter();
      console.log(`Sending email to ${data.recipient}...`);

      const info = await transporter.sendMail({
        from: data.senderEmail,
        to: data.recipient,
        subject: data.subject,
        text: data.body,
      });

      // Log the Ethereal preview URL so you can actually see the email
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`Email sent to ${data.recipient}: ${info.messageId}`);
      if (previewUrl) {
        console.log(`Preview URL: ${previewUrl}`);
      }

      // Update DB to mark as sent
      await prisma.emailJob.update({
        where: { id: data.jobId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

    } catch (error: any) {
      console.error(`Failed to send email to ${data.recipient}:`, error);

      await prisma.emailJob.update({
        where: { id: data.jobId },
        data: {
          status: 'FAILED',
          failedReason: error.message || 'Unknown error',
        },
      });

      // Rethrow to let BullMQ handle retries if configured
      throw error;
    }
  },
  {
    connection: config.redis.url
      ? new Redis(config.redis.url, { maxRetriesPerRequest: null, ...redisOptions })
      : {
        host: config.redis.host,
        port: config.redis.port,
      },
    concurrency: config.workerConcurrency,
  }
);

emailWorker.on('completed', (job) => {
  console.log(`Job ${job.id} has completed!`);
});

emailWorker.on('failed', (job, err) => {
  console.log(`Job ${job?.id} has failed with ${err.message}`);
});

console.log('Email worker started and listening for jobs...');

// Graceful shutdown for Worker process
async function gracefulShutdown() {
  console.log('Received shutdown signal for Worker, closing connections...');
  try {
    await emailWorker.close();
    console.log('BullMQ worker closed.');
    redis.disconnect();
    console.log('Redis disconnected.');
    await prisma.$disconnect();
    console.log('Prisma disconnected.');
    process.exit(0);
  } catch (err) {
    console.error('Error during worker shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
