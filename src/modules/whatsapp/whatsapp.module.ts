

import { ChatbotService } from "@/infra/services/chatbot-service.js";
import { WhatsappService } from "./whatsapp.service.js";
import { WhatsappController } from "./whatsapp.controller.js";
import type { FastifyInstance } from "fastify";


export async function whatsappModule(app: FastifyInstance) {
 
  const chatbotService = new ChatbotService();
  
  const whatsappService = new WhatsappService(app, chatbotService);
  const whatsappController = new WhatsappController(whatsappService);

  // --- Rotas Públicas (Meta) ---
  app.get('/whatsapp/webhook', (req, rep) => whatsappController.verifyWebhook(req, rep));
  app.post('/whatsapp/webhook', (req, rep) => whatsappController.handleWebhook(req, rep));

  // --- API Interna (Angular - ChatService) ---
  
  // 1. Listar Conversas
  app.get('/chat/conversations', (req, rep) => whatsappController.listConversations(req, rep));

  // 2. Detalhes da Conversa
  app.get('/chat/conversations/:id', (req, rep) => whatsappController.getConversation(req, rep));

  // 3. Enviar Mensagem (Texto)
  app.post('/chat/conversations/:id/messages', (req, rep) => whatsappController.sendMessage(req, rep));

  // 4. Enviar Mídia (Documento/Img)
  app.post('/chat/conversations/:id/media', (req, rep) => whatsappController.sendMedia(req, rep));

  // 5. Marcar como lido
  app.post('/chat/conversations/:id/read', (req, rep) => whatsappController.markAsRead(req, rep));

  // 6. Atualizar (Assumir conversa, mudar status)
  app.patch('/chat/conversations/:id', (req, rep) => whatsappController.updateConversation(req, rep));

  // 7. Atualizar Cliente
  app.put('/chat/conversations/:id/customer', (req, rep) => whatsappController.updateCustomer(req, rep));

  app.post('/chat/conversations/:id/approve', (req, rep) => whatsappController.aprovarContrato(req, rep));

  app.post('/chat/atendimentos/:id/mensagens/upload', (req, rep) => whatsappController.sendMedia(req, rep));
}