import { Router, Request, Response } from 'express';
import prisma from '../prismaClient';
import { enqueueEmailJob } from '../queue/emailQueue';
import nodemailer from 'nodemailer';

const router = Router();

// POST /api/campaigns
// Create a new campaign and schedule emails
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { subject, body, leads, scheduledAt, delayMinutes, hourlyLimit, userId } = req.body;

    // Validate inputs
    if (!subject || !body || !leads || !Array.isArray(leads) || leads.length === 0 || !scheduledAt || !userId) {
      res.status(400).json({ error: 'Missing required fields: subject, body, leads[], scheduledAt, userId' });
      return;
    }

    // Convert delayMinutes to seconds (frontend sends minutes)
    const delaySeconds = (delayMinutes || 0) * 60;
    const effectiveHourlyLimit = hourlyLimit || 100;

    // Ensure the user exists (for simplicity, create a dummy if not found via NextAuth)
    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@example.com`,
          name: 'Test User'
        }
      });
    }

    // Create an Ethereal test account for this campaign
    const testAccount = await nodemailer.createTestAccount();
    const senderEmail = testAccount.user;

    // Create the campaign
    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        subject,
        body,
        startTime: new Date(scheduledAt),
        delaySeconds,
        hourlyLimit: effectiveHourlyLimit,
        senderEmail,
      },
    });

    const startMs = new Date(scheduledAt).getTime();
    
    // Process leads and create EmailJobs
    for (let i = 0; i < leads.length; i++) {
      const recipient = leads[i];
      const jobScheduledAt = new Date(startMs + (i * delaySeconds * 1000));
      
      const emailJob = await prisma.emailJob.create({
        data: {
          campaignId: campaign.id,
          recipient,
          scheduledAt: jobScheduledAt,
          status: 'PENDING',
        }
      });

      // Enqueue to BullMQ
      await enqueueEmailJob({
        jobId: emailJob.id,
        recipient,
        subject,
        body,
        senderEmail,
        hourlyLimit: effectiveHourlyLimit,
      }, emailJob.scheduledAt);
      
      // Update status to SCHEDULED after successful enqueue
      await prisma.emailJob.update({
        where: { id: emailJob.id },
        data: { status: 'SCHEDULED' }
      });
    }

    res.status(201).json({ 
      message: 'Campaign created and emails scheduled', 
      campaignId: campaign.id,
      totalScheduled: leads.length,
      senderEmail,
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/campaigns
router.get('/', async (req: Request, res: Response) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: {
        emailJobs: true,
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
