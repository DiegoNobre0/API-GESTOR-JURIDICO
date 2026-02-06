
import { WebhookController } from '@/infra/controllers/webhook.controller.js';
import type { FastifyInstance } from 'fastify';

export async function webhookModule(app: FastifyInstance) {
  const webhookController = new WebhookController();

  // Definimos a rota aqui.
  // Como vamos registrar o módulo sem prefixo ou com prefixo no app.ts,
  // aqui definimos o caminho completo ou relativo.
  
  // Rota: POST /webhooks/zapsign
  app.post('/webhooks/zapsign', async (req, reply) => {
    // Webhooks públicos NÃO devem usar o decorator 'authenticate' (JWT),
    // pois o ZapSign não tem o token do usuário logado.
    return webhookController.handleZapSign(req, reply);
  });
}