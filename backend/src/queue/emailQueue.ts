import { Queue } from 'bullmq';
import { config } from '../config';

export const emailQueue = new Queue('email-queue', {
  connection: {
    host: config.redis.host,
    port: config.redis.port,
  },
});

export interface EmailJobData {
  jobId: string; // The primary key in the EmailJob table
  recipient: string;
  subject: string;
  body: string;
  senderEmail: string;
  hourlyLimit: number;
}

/**
 * Enqueues an email job to BullMQ with a specific delay.
 * The job is delayed until `scheduledAt`.
 */
export async function enqueueEmailJob(data: EmailJobData, scheduledAt: Date) {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());
  
  await emailQueue.add('send-email', data, {
    jobId: data.jobId, // Ensuring idempotency: BullMQ ignores if same jobId is already in the queue
    delay: delay,
    removeOnComplete: true,
    removeOnFail: false, // Keep failed jobs for debugging/retry
  });
}
