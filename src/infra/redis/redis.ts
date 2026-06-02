import { Redis } from 'ioredis';

// Ajuste a URL se estiver usando um Redis externo (como Upstash ou AWS)
export const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});