
import { WebhookController } from '../../infra/controllers/webhook.controller.js';
import type { FastifyInstance } from 'fastify';

export async function webhookModule(app: FastifyInstance) {
  const webhookController = new WebhookController();

  // Definimos a rota aqui.
  // Como vamos registrar o módulo sem prefixo ou com prefixo no app.ts,
  // aqui definimos o caminho completo ou relativo.


  // Dentro da sua rota Fastify
  app.post('/webhooks/whatsapp/media', async (req, reply) => {
    // 1. Pega o arquivo
    const data = await req.file();

    // 2. VALIDAÇÃO DE SEGURANÇA (Resolve o erro de TypeScript)
    if (!data) {
      return reply.status(400).send({ error: 'Nenhum arquivo enviado.' });
    }

    // 3. Extrai o telefone (exemplo: supondo que venha num campo 'from' ou params)
    // Se vier do multipart fields, seria algo como: data.fields.phone?.value
    const phone = '5511999999999'; // Substitua pela sua lógica de pegar o telefone

    // 4. Agora o TypeScript sabe que 'data' existe, então não precisa de '?'
    const buffer = await data.toBuffer();
    const mimetype = data.mimetype;

    // 5. Chama o controller sem erro
    await webhookController.handleIncomingMedia(
      phone,
      (await data?.toBuffer()) ?? Buffer.alloc(0), // Se não tiver buffer, manda vazio
      data?.mimetype ?? 'application/octet-stream' // Se não tiver mime, manda genérico
    )

    return reply.send({ ok: true });
  });
}