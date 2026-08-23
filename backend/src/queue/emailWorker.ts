import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { EmailJobData } from './emailQueue';
import nodemailer from 'nodemailer';
import prisma from '../prismaClient';
import Redis from 'ioredis';

// Shared Redis connection for rate limiting
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
});

// Helper to get rate limit key (scoped by sender + UTC hour)
function getRateLimitKey(senderEmail: string) {
  const now = new Date();
  const dateStr = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}-${now.getUTCHours()}`;
  return `rate_limit:${senderEmail}:${dateStr}`;
}

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

    // Increment rate limit counter
    const currentCount = await redis.incr(rateLimitKey);
    if (currentCount === 1) {
      // Set expiry to slightly more than 1 hour to auto-clean
      await redis.expire(rateLimitKey, 3600 + 60); 
    }

    if (currentCount > data.hourlyLimit) {
      // Decrement since we didn't send it
      await redis.decr(rateLimitKey);
      
      // Delay until the start of the next UTC hour
      const now = new Date();
      const nextHour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1, 0, 0, 0));
      const delayMs = nextHour.getTime() - now.getTime();
      
      console.log(`[Rate Limit] Sender ${data.senderEmail} reached limit. Delaying job ${job.id} by ${delayMs}ms.`);
      await job.moveToDelayed(Date.now() + delayMs, job.token!);
      return; // Do not process further
    }

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
    connection: {
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
