import { Queue } from 'bullmq';
import { redis } from '../redis/redis.js';


// Cria a fila dedicada para o chatbot jurídico
export const WhatsappQueue = new Queue('legal-whatsapp-queue', { 
  connection: redis 
});