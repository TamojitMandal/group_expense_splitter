import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';

const app = createApp();
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
