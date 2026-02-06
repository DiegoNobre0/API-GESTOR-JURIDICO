
import { prisma } from '@/lib/prisma.js';
import { ChatbotService } from '@/infra/services/chatbot-service.js';

import FormData from 'form-data';
import fs from 'fs';
import fetch from 'node-fetch'; // Certifique-se que instalou: npm i node-fetch
import type { FastifyInstance } from 'fastify';
import type { IncomingMessage, MetaMessagePayload } from './whatsapp.types.js';

export class WhatsappService {
  private version = 'v19.0';
  private baseUrl = `https://graph.facebook.com/${this.version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
  private token = process.env.WHATSAPP_ACCESS_TOKEN;

  constructor(
    private app: FastifyInstance,
    private chatbotService: ChatbotService
  ) { }

  // ===========================================================================
  // 1. MÉTODOS DE LEITURA (CONSULTA NO BANCO)
  // ===========================================================================

  async listarConversas() {
    return prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' }, // Traz as conversas mais recentes primeiro
      include: {
        // Traz a última mensagem para mostrar o preview na sidebar
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' }
        },
        // Traz dados do atendente se houver
        attendant: {
          select: { id: true, nome: true }
        }
      }
    });
  }

  async getConversationById(id: string) {
    return prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } }, // Histórico completo
        attendant: { select: { id: true, nome: true } }
      }
    });
  }

  // ===========================================================================
  // 2. MÉTODOS DE AÇÃO (ATUALIZAÇÃO NO BANCO)
  // ===========================================================================

  async updateConversation(id: string, data: any) {
    return prisma.conversation.update({
      where: { id },
      data: data
    });
  }

  async updateCustomerData(id: string, data: { nome: string; telefone: string }) {
    return prisma.conversation.update({
      where: { id },
      data: { customerName: data.nome }
      // Nota: Evitamos alterar o telefone pois ele é o ID do WhatsApp
    });
  }

  async markConversationAsRead(id: string) {
    // 1. Zera o contador no banco
    await prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 }
    });

    // 2. (Opcional) Envia "Lido" para a Meta para ficar azul no celular do cliente
    // Você precisaria pegar a última mensagem recebida dessa conversa para marcar
  }

  // ===========================================================================
  // 3. MÉTODOS DE ENVIO (FRONTEND -> CONTROLLER -> SERVICE -> META)
  // ===========================================================================

  // Chamado pelo Controller quando o Front manda POST /messages
  async sendTextByConversationId(conversationId: string, text: string) {
    // Busca o telefone do cliente atrelado a este ID de conversa
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new Error('Conversa não encontrada');

    // Chama o método core de envio
    return this.sendText(conversation.customerPhone, text, conversationId);
  }

  // Chamado pelo Controller quando o Front manda POST /media
  async sendFileByConversationId(conversationId: string, filePath: string, mimeType: string, fileName: string) {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new Error('Conversa não encontrada');

    return this.sendFile(conversation.customerPhone, filePath, mimeType, fileName, conversationId);
  }

  // --- CORE: Envio de Texto ---
  private async sendText(to: string, text: string, conversationId?: string) {
    // 1. Envia para a Meta
    const payload: MetaMessagePayload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text, preview_url: true }
    };
    const metaResponse : any = await this.callMetaApi('/messages', 'POST', payload);

    if (metaResponse.error) {
      console.error('META ERROR:', metaResponse.error);
      throw new Error(metaResponse.error.message);
    }

    if (!metaResponse.messages?.[0]?.id) {
      console.error('META RESPONSE INVÁLIDA:', metaResponse);
      throw new Error('Mensagem não aceita pela Meta');
    }
    // 2. Garante que a conversa existe (Safety check)
    if (!conversationId) {
      const conv = await this.findOrCreateConversation(to);
      conversationId = conv.id;
    }

    // 3. Salva no Banco (Como mensagem do Agente)
    const savedMessage = await prisma.message.create({
      data: {
        wa_id: metaResponse.messages?.[0]?.id,
        content: text,
        role: 'AGENT',
        type: 'text',
        status: 'sent',
        conversationId: conversationId!
      }
    });

    // 4. Atualiza o resumo da conversa
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageBody: text, lastMessageTime: new Date() }
    });

    return savedMessage;
  }

  // --- CORE: Envio de Arquivo ---
  private async sendFile(to: string, filePath: string, mimeType: string, fileName: string, conversationId?: string) {
    // 1. Faz Upload do Arquivo para a Meta
    const mediaId = await this.uploadMediaToMeta(filePath, mimeType);

    // 2. Envia a Mensagem referenciando o ID da Mídia
    const payload: MetaMessagePayload = {
      messaging_product: 'whatsapp',
      to,
      type: 'document', // Adapte para 'image' se mimeType for imagem
      document: { id: mediaId, filename: fileName }
    };

    // Ajuste simples para imagens
    if (mimeType.includes('image')) {
      payload.type = 'image';
      delete payload.document;
      payload.image = { id: mediaId };
    }

    const metaResponse: any = await this.callMetaApi('/messages', 'POST', payload);

    if (!conversationId) {
      const conv = await this.findOrCreateConversation(to);
      conversationId = conv.id;
    }

    // 3. Salva no Banco
    const savedMessage = await prisma.message.create({
      data: {
        wa_id: metaResponse.messages?.[0]?.id,
        content: fileName, // O conteúdo é o nome do arquivo
        role: 'AGENT',
        type: mimeType.includes('image') ? 'image' : 'document',
        status: 'sent',
        fileName: fileName,
        conversationId: conversationId!
      }
    });

    return savedMessage;
  }

  // ===========================================================================
  // 4. WEBHOOK (META -> BACKEND -> SOCKET/BANCO)
  // ===========================================================================

  async processWebhook(body: any) {
    const changes = body.entry?.[0]?.changes?.[0];
    if (!changes) return;

    const value = changes.value;
    const message = value.messages?.[0] as IncomingMessage;
    const contactName = value.contacts?.[0]?.profile?.name || 'Cliente WhatsApp';

    // Se houver mensagem
    if (message) {
      // 1. Marca como Lido na Meta (Feedback visual instantâneo)
      await this.markAsRead(message.id);

      // 2. Encontra ou Cria a Conversa no Banco
      const conversation = await this.findOrCreateConversation(message.from, contactName);

      // 3. Salva a Mensagem no Banco
      const content = message.text?.body || this.getMediaContent(message);

      const savedMessage = await prisma.message.create({
        data: {
          wa_id: message.id,
          content: content,
          role: 'USER', // Mensagem vindo do cliente
          type: message.type,
          status: 'read',
          conversationId: conversation.id,
          // Nota: Para mídia real vinda do cliente, precisaríamos baixar o arquivo via API da Meta
          // Por enquanto, salvamos sem URL.
          mediaUrl: null
        }
      });

      // 4. Atualiza a Conversa (Incrementa não lidas)
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          unreadCount: { increment: 1 },
          lastMessageBody: content,
          lastMessageTime: new Date()
        }
      });

      // 5. Emite para o Frontend via Socket.io
      console.log(`📩 Nova mensagem de ${contactName}: ${content}`);
      this.app.io.emit('new_whatsapp_message', {
        ...savedMessage,
        conversationId: conversation.id
      });

      // 6. Lógica de IA (Chatbot) - Só responde se a conversa estiver "OPEN" e SEM atendente humano
      if (!conversation.attendantId && message.type === 'text') {
        // Envia para o serviço de IA
        const aiResponse : any = await this.chatbotService.chat(message.text!.body, message.from);

        // A IA responde automaticamente
        await this.sendText(message.from, aiResponse, conversation.id);
      }
    }
  }

  // ===========================================================================
  // 5. HELPERS PRIVADOS (FERRAMENTAS)
  // ===========================================================================

  // Lógica de "Upsert" (Encontrar ou Criar)
  private async findOrCreateConversation(phone: string, name?: string) {
    let conversation = await prisma.conversation.findUnique({
      where: { customerPhone: phone }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          customerPhone: phone,
          customerName: name || phone,
          status: 'OPEN',
          channel: 'whatsapp',
          unreadCount: 0
        }
      });
    }
    return conversation;
  }

  // Upload para a Meta usando FormData e Blob (Compatível com Node moderno)
  private async uploadMediaToMeta(filePath: string, mimeType: string): Promise<string> {
    const form = new FormData();
    const fileBuffer = fs.readFileSync(filePath);

    // Cria um Blob para o FormData aceitar
    const fileBlob = new Blob([fileBuffer], { type: mimeType });

    form.append('file', fileBlob, 'upload.file');
    form.append('type', mimeType);
    form.append('messaging_product', 'whatsapp');

    const response = await fetch(`https://graph.facebook.com/${this.version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: form
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error('Erro Upload Meta:', txt);
      throw new Error('Falha no upload para Meta');
    }

    const data: any = await response.json();
    return data.id;
  }

  // Wrapper para chamadas genéricas na API da Meta
  private async callMetaApi(endpoint: string, method: string, body: any) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  // Marca mensagem como lida na API da Meta
  async markAsRead(messageId: string) {
    await this.callMetaApi('/messages', 'POST', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    });
  }

  // Helper para identificar texto descritivo de mídias
  private getMediaContent(msg: IncomingMessage): string {
    if (msg.type === 'image') return '[Imagem]';
    if (msg.type === 'document') return msg.document?.filename || '[Documento]';
    if (msg.type === 'audio') return '[Áudio]';
    return '[Mídia]';
  }
}