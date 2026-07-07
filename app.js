import 'dotenv/config';
import express from 'express';
import planRouter from './routers/plan.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/', planRouter);

app.listen(PORT, () => {
  console.log(`Agent MVP running on http://localhost:${PORT}`);
});
