
import { z } from 'zod';
import { ChatbotService } from '../../services/chatbot-service';
import type { FastifyInstance } from 'fastify';

export async function whatsappRoutes(app: FastifyInstance) {
  // O ChatbotService já possui a lógica da IA injetada
  const chatbotService = app.diContainer.resolve('chatbotService'); 

  // 1. Verificação do Webhook (Exigido pela Meta)
  app.get('/webhook/whatsapp', async (request, reply) => {
    const querySchema = z.object({
      'hub.mode': z.string(),
      'hub.verify_token': z.string(),
      'hub.challenge': z.string(),
    });

    const query = querySchema.parse(request.query);

    if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
      return reply.send(query['hub.challenge']);
    }
    return reply.status(403).send();
  });

  // 2. Recebimento de Mensagens do WhatsApp
  app.post('/webhook/whatsapp', async (request, reply) => {
    const body: any = request.body;

    // Verificamos se é uma mensagem de texto válida
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    
    if (message && message.type === 'text') {
      const from = message.from; // Número do celular
      const text = message.text.body;

      // Chamamos o SEU serviço de IA
      // Passamos o 'from' como userId para manter o contexto no Prisma
      const aiResponse = await chatbotService.chat(text, from);

      // Função para enviar de volta para a API da Meta
      await enviarParaWhatsApp(from, aiResponse.response);
    }

    return reply.status(200).send();
  });
}