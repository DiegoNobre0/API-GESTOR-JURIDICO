
import { prisma } from '../../lib/prisma.js'; // Ajuste o caminho conforme seu projeto

import type { Conversation } from '@prisma/client'; // Opcional: para tipagem
import type { FastifyReply, FastifyRequest } from 'fastify';
import { StorageService } from '../services/storage.service.js';
import { ChatbotService } from '../services/chatbot-service.js';

export class WebhookController {
  private storage: StorageService;
  private chatbot: ChatbotService;

  constructor() {
    this.storage = new StorageService();
    this.chatbot = new ChatbotService();
  }

  /**
   * Processa mídia recebida (Imagem/PDF)
   * Nota: Este método espera receber o buffer direto. 
   * Se você usa fastify-multipart, chame este método de dentro da sua rota principal.
   */
  async handleIncomingMedia(
    customerPhone: string,
    fileBuffer: Buffer,
    mimeType: string
  ) {
    console.log(`[Webhook] Recebendo mídia de ${customerPhone} (${mimeType})`);

    // 1. Busca a conversa para entender o contexto
    const conversation = await prisma.conversation.findUnique({
      where: { customerPhone },
    });

    if (!conversation) {
      console.log('[Webhook] Conversa não encontrada para upload.');
      return;
    }

    // 2. Lógica de "Adivinhação" do Tipo de Documento
    let docTypeTag = 'OUTROS';

    // Recupera o que falta
    const pendentes = await this.getDocumentosPendentes(conversation);

    if (conversation.workflowStep === 'COLETA_DOCS' && pendentes.length > 0) {
      // Assume que o usuário mandou o primeiro da lista de pendências
      docTypeTag = pendentes[0] ?? 'OUTROS';
      console.log(`[Webhook] Inferindo tipo de documento: ${docTypeTag}`);
    }

    // 3. Upload para Cloudflare R2
    const extension = mimeType.split('/')[1] || 'jpg';

    // Define a pasta no R2 (ex: clientes/551199999/RG.jpg)
    const folder = `clientes/${customerPhone}`;

    const uploadResult = await this.storage.uploadFile(fileBuffer, extension, folder);

    // 4. Salvar no Banco (O PULO DO GATO)
    // Salvamos como "RG.jpg" para o ChatbotService reconhecer que o RG chegou
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        type: 'document',
        content: uploadResult.url, // URL pública da imagem
        fileName: `${docTypeTag}.${extension}`,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastCustomerMessageAt: new Date(),
        fallbackStage: 0
      }
    })

    console.log(`[Webhook] Documento salvo no banco: ${docTypeTag}.${extension}`);

    // 5. Acionar o Bot novamente para ele agradecer e pedir o próximo
    // Enviamos uma mensagem vazia '' apenas para gatilhar o fluxo
    const response = await this.chatbot.chat('', customerPhone);

    return response;
  }

  

  /**
   * Helper Privado: Verifica quais documentos faltam
   */
  private async getDocumentosPendentes(conversation: { id: string, tipoCaso?: string | null }) {
    // Recupere as mensagens de documento já salvas
    const msgs = await prisma.message.findMany({
      where: { conversationId: conversation.id, type: 'document' },
      select: { fileName: true }
    });

    const recebidos = msgs
      .map((m) => m.fileName?.split('.')[0]?.toUpperCase())
      .filter((doc): doc is string => !!doc);

    // Defina sua lista base (Sincronize isso com o ChatbotService se possível para não duplicar código)
    // O ideal seria importar essa constante de um arquivo 'constants.ts' ou 'types.ts'
    const checklistBase = ['RG', 'COMP_RES'];

    // Se quiser lógica específica por tipo de caso (ex: VOO), adicione aqui:
    // if (conversation.tipoCaso === 'VOO') checklistBase.push('PASSAGEM');

    return checklistBase.filter((d) => !recebidos.includes(d));
  }
}