import { Router, Request, Response } from 'express';
import prisma from '../prismaClient';

const router = Router();

// GET /api/emails/scheduled
router.get('/scheduled', async (req: Request, res: Response) => {
  try {
    const emails = await prisma.emailJob.findMany({
      where: {
        status: {
          in: ['PENDING', 'SCHEDULED']
        }
      },
      include: {
        campaign: {
          select: { subject: true }
        }
      },
      orderBy: { scheduledAt: 'asc' }
    });
    const now = new Date();
    const emailsWithDisplayStatus = emails.map((job) => {
      // If it is SCHEDULED but its original scheduled time has passed, it is waiting
      // due to rate limiting or worker downtime.
      let displayStatus = job.status as string;
      if (job.status === 'SCHEDULED' && new Date(job.scheduledAt) < now) {
        displayStatus = 'RATE LIMITED';
      }
      return {
        ...job,
        displayStatus,
      };
    });
    res.json(emailsWithDisplayStatus);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/emails/sent
router.get('/sent', async (req: Request, res: Response) => {
  try {
    const emails = await prisma.emailJob.findMany({
      where: {
        status: {
          in: ['SENT', 'FAILED']
        }
      },
      include: {
        campaign: {
          select: { subject: true }
        }
      },
      orderBy: { sentAt: 'desc' }
    });
    res.json(emails);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
