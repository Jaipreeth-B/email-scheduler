import express from 'express';
import cors from 'cors';
import { config } from './config';
import campaignRoutes from './routes/campaign';
import emailRoutes from './routes/emails';
import prisma from './prismaClient';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/campaigns', campaignRoutes);
app.use('/api/emails', emailRoutes);

// Recovery on restart logic:
// When the server restarts, BullMQ automatically resumes any jobs in the delayed set
// and any pending jobs in the wait set. 
// However, any jobs that were actively processing and the server crashed might be stuck in "active" state.
// BullMQ handles this via "stalled jobs" detection natively and will move them back to "wait" state.

const server = app.listen(config.port, () => {
  console.log(`Backend server listening on port ${config.port}`);
});

// Graceful shutdown for API process
async function gracefulShutdown() {
  console.log('Received shutdown signal for API, closing HTTP server...');
  server.close(async () => {
    console.log('HTTP server closed.');
    await prisma.$disconnect();
    console.log('Prisma disconnected.');
    process.exit(0);
  });
  
  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
