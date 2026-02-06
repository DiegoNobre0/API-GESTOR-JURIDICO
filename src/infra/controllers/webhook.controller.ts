
import { prisma } from '@/lib/prisma.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
// Se você tiver um serviço de WhatsApp exportado, pode importar aqui para avisar o cliente
// import { whatsappService } from '@/...'; 

export class WebhookController {
  
  async handleZapSign(req: FastifyRequest, reply: FastifyReply) {
    const data = req.body as any;

    console.log("🔔 Webhook ZapSign Recebido:", data.event_type);

    // Verificamos se o evento é "Documento Assinado"
    if (data.event_type === 'doc_signed') {
      const signers = data.payload.signers;
      
      // Vamos procurar quem é o cliente pelo email ou nome que voltou
      for (const signer of signers) {
        if (signer.status === 'signed') {
          console.log(`✅ Assinado por: ${signer.email}`);

          // 1. Acha o cliente no banco
          // (O ideal é buscar pelo email, garanta que coletou o email antes)
          const conversa = await prisma.conversation.findFirst({
            where: { 
              // Aqui tentamos achar pelo nome ou email que o ZapSign devolveu
              OR: [
                { customerName: signer.name },
                // { customerEmail: signer.email } // Se você tiver campo de email
              ]
            }
          });

          if (conversa) {
            // 2. Atualiza o status para FINALIZADO ou PRONTO_PARA_PROTOCOLO
            await prisma.conversation.update({
              where: { id: conversa.id },
              data: { workflowStep: 'FINALIZADO' }
            });

            console.log(`🚀 Workflow do cliente ${conversa.customerName} movido para FINALIZADO.`);
            
            // Aqui você poderia chamar o whatsappService.sendText(conversa.customerPhone, "Recebi sua assinatura!")
          }
        }
      }
    }

    return reply.status(200).send({ received: true });
  }
}