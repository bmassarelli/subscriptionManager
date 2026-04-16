require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initPool } = require('./db');
const subscriptionsRouter = require('./routes/subscriptions');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.use('/api/subscriptions', subscriptionsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

initPool()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize DB pool:', err);
    process.exit(1);
  });
