import express from 'express';
import cors from 'cors';
import { config } from './config';
import campaignRoutes from './routes/campaign';
import emailRoutes from './routes/emails';
import './queue/emailWorker'; // Import to initialize worker

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

app.listen(config.port, () => {
  console.log(`Backend server listening on port ${config.port}`);
});
