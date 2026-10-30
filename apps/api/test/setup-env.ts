// O e2e não lê .env: as variáveis vêm daqui, e o banco é substituído por um dublê.
Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://schdlr:schdlr@localhost:5434/schdlr_test',
  CORS_ORIGIN: 'http://localhost:3000',
  JWT_SECRET: 'e2e-secret-with-at-least-32-characters',
  JWT_EXPIRES_IN: '15m',
})
