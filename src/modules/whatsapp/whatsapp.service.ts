import { prisma } from '../../lib/prisma.js';
import { ChatbotService } from '../../infra/services/chatbot/chatbot-service.js';
import { StorageService } from '../../infra/services/storage.service.js'; // <--- IMPORTANTE
import axios from 'axios';
import type { FastifyInstance } from 'fastify';
import type { IncomingMessage, MetaMessagePayload } from './whatsapp.types.js';
import { DocumentAnalysisService } from '../../infra/services/document-analysis.service.js';
import { normalizarTipoDocumento } from '../../infra/services/utils/documentos.js';
import OpenAI, { toFile } from "openai";

import { WhatsappQueue } from '@/infra/queues/whatsapp.queue.js';
import { redis } from '@/infra/redis/redis.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class WhatsappService {
  private version = 'v24.0';
  private baseUrl = `https://graph.facebook.com/${this.version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
  private token = process.env.WHATSAPP_ACCESS_TOKEN;
  private storageService: StorageService; // <--- Instância do Storage
  private docAnalysisService: DocumentAnalysisService;


  constructor(
    public app: FastifyInstance,
    private chatbotService: ChatbotService
  ) {
    this.storageService = new StorageService();
    this.docAnalysisService = new DocumentAnalysisService();
  }
 

async processWebhook(body: any) {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    const statusesData = value?.statuses?.[0]; // Recibos de leitura/entrega da Meta

    // 1. Ignora eventos de status de leitura/entrega por enquanto
    if (statusesData) return;
    if (!message) return; 

    // 2. Extrai dados básicos
    const customerPhone = message.from;
    // 👇 CORREÇÃO: Mudamos de contactName para customerName aqui
    const customerName = value.contacts?.[0]?.profile?.name || 'Cliente WhatsApp';

    // 3. Deduplicação Atômica no Redis (Proteção contra Double-Texting da Meta)
    // Cria uma chave única com o ID da mensagem que expira em 5 minutos
    const dedupeKey = `webhook_dedupe:${message.id}`;
    const isNewMessage = await redis.set(dedupeKey, '1', 'EX', 300, 'NX');
    
    if (!isNewMessage) {
      console.log(`[Webhook] ⚠️ Mensagem duplicada ignorada pelo Redis: ${message.id}`);
      return;
    }

    // 4. Marca como Lido (Feedback visual rápido no celular do cliente)
    // Como é uma chamada de rede simples, podemos manter no webhook (sem `await` travando o fluxo se não quiser)
    this.markAsRead(message.id).catch(e => console.warn('Erro ao marcar lido', e.message));

    // 👇 CORREÇÃO: Atualizado aqui também
    console.log(`📥 [Webhook] Mensagem recebida de ${customerName}. Enviando para a fila...`);

    // 5. Joga todo o payload na fila do BullMQ e encerra a requisição na hora!
    await WhatsappQueue.add('process-chat-message', {
      messageData: message,
      customerPhone,
      customerName // ✅ Agora sim, ele encontra a variável!
    });
  }


  // Adicione dentro de WhatsappService (sistema do advogado)
  async sendInteractiveTextMessage(to: string, bodyText: string, buttons: { id: string; title: string }[], conversationId?: string) {
    if (!this.token || !process.env.WHATSAPP_PHONE_NUMBER_ID) return;

    const safeButtons = buttons.map(btn => ({
      type: 'reply',
      reply: {
        id: btn.id.substring(0, 256),
        title: btn.title.substring(0, 20),
      }
    }));

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText.substring(0, 1024) },
        action: { buttons: safeButtons }
      }
    };

    try {
      const metaResponse: any = await this.callMetaApi('/messages', 'POST', payload);

      if (!metaResponse.error && conversationId) {
        // Loga a mensagem enviada no banco para aparecer no frontend
        const savedMessage = await prisma.message.create({
          data: {
            wa_id: metaResponse.messages?.[0]?.id,
            content: bodyText,
            role: 'AGENT',
            type: 'text',
            status: 'sent',
            conversationId: conversationId
          }
        });

        await prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessageBody: '[Botões Interativos Enviados]', lastMessageTime: new Date() }
        });

        this.app.io.emit('new_whatsapp_message', { ...savedMessage, conversationId });
      }
    } catch (error) {
      console.error('[WhatsApp Interactive Error]:', error);
      // Fallback: Se der erro, manda como texto normal
      await this.sendText(to, bodyText, conversationId);
    }
  }



  private async handleIncomingMedia(
    message: IncomingMessage,
    conversation: any
  ) {
    try {
      const workflowStep = conversation.workflowStep?.trim();
      const fasesDocs = ['COLETA_DOCS', 'COLETA_DOCS_EXTRA'];
      const estaEmFaseDeDocs = fasesDocs.includes(workflowStep);


      // ============================
      // UX – feedback imediato (Somente para imagens/pdfs)
      // ============================
      if (workflowStep === "COLETA_DOCS" && message.type !== 'audio' && message.type !== 'voice') {
        await this.sendText(
          conversation.customerPhone,
          'Recebi seu arquivo! 📎\nEstou analisando e salvando, aguarde um instante...',
          conversation.id
        );
      }

      // ============================
      // 1. IDENTIFICAÇÃO DA MÍDIA
      // ============================
      let mediaId = '';
      let mimeType = '';
      let mediaType: 'image' | 'document' | 'audio' | 'video' = 'document';
      let fileName = '';

      switch (message.type) {
        case 'image':
          mediaId = message.image?.id || '';
          mimeType = message.image?.mime_type || 'image/jpeg';
          mediaType = 'image';
          fileName = `imagem_${Date.now()}.jpg`;
          break;

        case 'document':
          mediaId = message.document?.id || '';
          mimeType = message.document?.mime_type || 'application/pdf';
          mediaType = 'document';
          fileName = message.document?.filename || `documento_${Date.now()}.pdf`;
          break;

        case 'video': // 👈 VÍDEO AGORA É RECONHECIDO AQUI
          mediaId = message.video?.id || '';
          mimeType = message.video?.mime_type || 'video/mp4';
          mediaType = 'video';
          fileName = `video_${Date.now()}.mp4`;
          break;

        case 'audio':
        case 'voice':
        case 'ptt':
          mediaId = message.audio?.id || '';
          mimeType = message.audio?.mime_type || 'audio/ogg';
          mediaType = 'audio';
          fileName = `audio_${Date.now()}.ogg`;
          break;
      }

      if (!mediaId) {
        console.warn('⚠️ [Media] Nenhum Media ID encontrado no payload:', message);
        return;
      }

      // ============================
      // 2. DOWNLOAD & UPLOAD PARA O R2
      // ============================
      const fileBuffer = await this.downloadMediaFromMeta(mediaId);
      const extension = fileName.split('.').pop() || 'bin';
      const folder = `clientes/${conversation.customerPhone}`;

      // Salva no Cloudflare R2
      const uploadResult = await this.storageService.uploadFile(
        fileBuffer,
        extension,
        folder
      );

      // ============================
      // 3. SE FOR ÁUDIO (TRANSCRIÇÃO E RESPOSTA)
      // ============================
      if (mediaType === 'audio' && workflowStep !== 'COLETA_DOCS_EXTRA') {
        const textoTranscrito = await this.transcreverAudio(fileBuffer, fileName);

        if (!textoTranscrito) {
          await this.sendText(
            conversation.customerPhone,
            'Desculpe, não consegui entender o áudio. Pode digitar ou gravar novamente?',
            conversation.id
          );
          return; // Só retorna aqui se deu ERRO na transcrição
        }

        // Salva transcrição no histórico do banco como texto
        const savedText = await prisma.message.create({
          data: {
            wa_id: `${message.id}_transcript`,
            content: `🎤 Áudio transcrito: "${textoTranscrito}"`,
            role: 'USER',
            type: 'text',
            status: 'read',
            conversationId: conversation.id,
          }
        });

        this.app.io.emit('new_whatsapp_message', { ...savedText, conversationId: conversation.id });

        // Chama a IA para ler e responder o que foi falado no áudio
        const aiResponse = await this.chatbotService.chat(textoTranscrito, conversation.customerPhone);

        if (aiResponse) {
          await this.sendText(conversation.customerPhone, aiResponse, conversation.id);
        }

        // 🔥 RETIRAMOS O RETURN QUE HAVIA AQUI! 
        // Agora o código vai descer pro passo 4 e salvar o áudio nas provas.
      }

      // ============================
      // 4. SALVAR A MÍDIA COMO PROVA (IMAGEM, PDF, VÍDEO E ÁUDIO)
      // ============================
      let tipoDocumento: any = 'COMPLEMENTAR';
      let etapaDocumento: 'ESSENCIAL' | 'COMPLEMENTAR' = 'COMPLEMENTAR';
      let analiseIA: any = null;

      // Se for imagem na fase de coleta inicial, tenta OCR
      if (workflowStep === 'COLETA_DOCS' && mediaType === 'image') {
        etapaDocumento = 'ESSENCIAL';

        // 1️⃣ Faz apenas UMA chamada inteligente para a IA
        analiseIA = await this.docAnalysisService.analyzeDocument(fileBuffer);

        if (!analiseIA || !analiseIA.legivel || analiseIA.tipo_identificado === 'OUTROS') {
          console.log('⚠️ Documento ilegível, tipo não reconhecido ou não é útil no momento.');
          // Aqui você pode retornar um sendText pedindo pro usuário enviar uma foto mais nítida
          return;
        }

        // 2️⃣ Mapeia o resultado da IA para a nomenclatura do seu Checklist
        if (analiseIA.tipo_identificado === 'RG') {
          tipoDocumento = 'RG';
        }
        else if (analiseIA.tipo_identificado === 'CNH') {
          tipoDocumento = 'CNH'; // Se o seu checklist aceita CNH no lugar do RG, pode por 'RG' aqui também
        }
        else if (analiseIA.tipo_identificado === 'COMPROVANTE_RESIDENCIA') {
          tipoDocumento = 'COMP_RES';
        }
      }

      // 👈 APLICANDO OS NOMES CORRETOS PARA ÁUDIO E VÍDEO
      if (mediaType === 'audio') tipoDocumento = 'AUDIO_WHATSAPP';
      if (mediaType === 'video') tipoDocumento = 'VIDEO_WHATSAPP';

      tipoDocumento = normalizarTipoDocumento(tipoDocumento);

      // 👉 SALVA NO BANCO (Aparece no Drawer de "Provas Complementares")
      await prisma.conversationDocument.create({
        data: {
          conversationId: conversation.id,
          tipo: tipoDocumento,
          etapa: etapaDocumento,
          mediaUrl: uploadResult.url,
          fileName: `${tipoDocumento}.${extension}`,
          mimeType,
          validado: etapaDocumento === 'COMPLEMENTAR' ? true : analiseIA?.legivel ?? false,
          extractedData: etapaDocumento === 'ESSENCIAL' ? analiseIA ?? {} : {},
        },
      });

      // Atualiza OCR no banco se tiver extraído algo
      // Atualiza OCR no banco se tiver extraído algo
      if (etapaDocumento === 'ESSENCIAL' && analiseIA?.legivel) {

        const tempAtual = (conversation.tempData as any) ?? {};
        const prefix = `extracted_${tipoDocumento}`;

        const patch: any = {
          [`${prefix}_legivel`]: true,
        };

        if (analiseIA.nome_completo) {
          patch[`${prefix}_nome`] = analiseIA.nome_completo;
        }

        // ==========================================
        // 🛡️ TRATAMENTO ANTI-CONFUSÃO (RG vs CPF)
        // ==========================================
        let rgEncontrado = analiseIA.rg_numero;
        let cpfEncontrado = analiseIA.cpf_numero;

        const rgLimpo = rgEncontrado ? String(rgEncontrado).replace(/\D/g, '') : '';
        const cpfLimpo = cpfEncontrado ? String(cpfEncontrado).replace(/\D/g, '') : '';

        // Se o suposto RG tem 11 dígitos (tamanho exato de um CPF) e o CPF veio vazio, a IA inverteu!
        if (!cpfEncontrado && rgLimpo.length === 11) {
          cpfEncontrado = rgEncontrado; // Joga o valor pro CPF
          rgEncontrado = null;          // Limpa o RG falso
        }

        // Se o suposto CPF tem menos de 11 dígitos (tamanho comum de RG) e o RG veio vazio, a IA inverteu pro outro lado!
        if (!rgEncontrado && cpfLimpo.length > 5 && cpfLimpo.length < 11) {
          rgEncontrado = cpfEncontrado; // Joga o valor pro RG
          cpfEncontrado = null;         // Limpa o CPF falso
        }

        // ✅ Agora sim, salva os valores validados e corrigidos
        if (rgEncontrado) {
          patch[`${prefix}_rg`] = rgEncontrado;
        }

        if (cpfEncontrado) {
          patch[`${prefix}_cpf`] = cpfEncontrado;
        }
        // ==========================================

        // Endereço apenas para comprovante
        if (tipoDocumento === 'COMP_RES' && analiseIA.endereco_completo) {
          patch[`${prefix}_endereco`] = analiseIA.endereco_completo;
        }

        // Controle de frente e verso
        if (analiseIA.lado === 'FRENTE_E_VERSO') {
          patch[`${prefix}_FRENTE_legivel`] = true;
          patch[`${prefix}_VERSO_legivel`] = true;
        }

        if (analiseIA.lado === 'FRENTE') {
          patch[`${prefix}_FRENTE_legivel`] = true;
        }

        if (analiseIA.lado === 'VERSO') {
          patch[`${prefix}_VERSO_legivel`] = true;
        }

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            tempData: {
              ...tempAtual,
              ...patch,
            },
          },
        });
      }

      // Loga a mídia visualmente no Chat do Painel
      const savedMessage = await prisma.message.create({
        data: {
          wa_id: message.id,
          content: uploadResult.url,
          role: 'USER',
          type: mediaType,
          status: 'read',
          conversationId: conversation.id,
          fileName: `${tipoDocumento}.${extension}`,
        },
      });

      this.app.io.emit('new_whatsapp_message', { ...savedMessage, conversationId: conversation.id });

      // ============================
      // 5. RESPOSTA DO BOT PÓS-MÍDIA
      // ============================

      // 🔴 SE FOR ÁUDIO, PARA AQUI! O bot já respondeu no passo 3 baseado no texto transcrito.
      // E se o cliente não estiver na fase de coleta de documentos, também para aqui.
      // if (mediaType === 'audio' || !estaEmFaseDeDocs) return;

      const pendentesAgora = await this.getDocumentosPendentes(conversation.id);

      if (workflowStep === 'COLETA_DOCS_EXTRA') {
        // Em vez de texto simples, mandamos um botão para facilitar a vida do cliente
        await this.sendInteractiveTextMessage(
          conversation.customerPhone,
          'Mídia recebida e guardada no seu processo! 📎\n\nVocê tem mais alguma prova para enviar ou podemos seguir para a assinatura?',
          [
            { id: 'BTN_ENVIAR_MAIS', title: '📎 Enviar mais provas' },
            { id: 'BTN_FINALIZAR_PROVAS', title: '🚀 Finalizar envio' }
          ],
          conversation.id
        );
        return;
      }
      else if (pendentesAgora.length === 0) {
        // await prisma.conversation.update({
        //   where: { id: conversation.id },
        //   data: { workflowStep: 'COLETA_DOCS_EXTRA' },
        // });
        const promptDoBot = `
[SISTEMA]:
Perfeito! Recebemos todas as documentações básicas.
Explique que agora ele pode enviar provas adicionais (fotos, vídeos, áudios, prints).
Diga que quando terminar, deve digitar FINALIZAR.`;
        const aiResponse = await this.chatbotService.chat(promptDoBot, conversation.customerPhone);
        if (aiResponse) await this.sendText(conversation.customerPhone, aiResponse, conversation.id);
      }
      else {
        const proximo = pendentesAgora[0];
        let nomeProximo = proximo === 'RG' ? 'RG ou CNH (foto legível)' : 'Comprovante de Residência';
        const feedback = analiseIA && !analiseIA.legivel ? `A imagem enviada ficou um pouco ilegível.` : `Recebido com sucesso.`;

        const promptDoBot = `[SISTEMA]: ${feedback}. Peça imediatamente o próximo documento: ${nomeProximo}.`;
        const aiResponse = await this.chatbotService.chat(promptDoBot, conversation.customerPhone);
        if (aiResponse) await this.sendText(conversation.customerPhone, aiResponse, conversation.id);
      }

    } catch (error) {
      console.error('❌ Erro processamento mídia:', error);
      await this.sendText(
        conversation.customerPhone,
        'Tive um problema ao processar seu arquivo. Pode tentar enviar de novo?',
        conversation.id
      );
    }
  }



  // ===========================================================================
  // CORREÇÃO 2: Adicionando o método que faltava (Erro TypeScript)
  // ===========================================================================
  async sendMediaMessage(conversationId: string, fileBuffer: Buffer, mimeType: string, fileName: string) {
    // 1. Busca conversa
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new Error('Conversa não encontrada');

    // 2. Upload para Cloud (Seu R2)
    const folder = `atendimentos/${conversation.customerPhone}`;
    const uploadResult = await this.storageService.uploadFile(fileBuffer, fileName.split('.').pop() || 'bin', folder);

    // 3. Upload para Meta
    const mediaId = await this.uploadMediaToMeta(fileBuffer, mimeType, fileName);

    // 4. Payload Meta
    let payload: MetaMessagePayload = {
      messaging_product: 'whatsapp',
      to: conversation.customerPhone,
      type: 'document',
      document: { id: mediaId, filename: fileName }
    };

    if (mimeType.startsWith('image/')) {
      payload.type = 'image';
      delete payload.document;
      payload.image = { id: mediaId };
    } else if (mimeType.startsWith('audio/')) {
      payload.type = 'audio';
      delete payload.document;
      payload.audio = { id: mediaId };
    }

    // 5. Envia
    const metaResponse: any = await this.callMetaApi('/messages', 'POST', payload);
    if (metaResponse.error) throw new Error(metaResponse.error.message);

    // 6. Salva mensagem no banco
    const savedMessage = await prisma.message.create({
      data: {
        wa_id: metaResponse.messages?.[0]?.id,
        content: uploadResult.url, // Salva URL do R2
        role: 'AGENT',
        type: this.mapMimeTypeToPrismaType(mimeType),
        status: 'sent',
        fileName: fileName,
        conversationId: conversation.id
      }
    });

    // 7. Atualiza conversa e Socket
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageBody: fileName, lastMessageTime: new Date() }
    });
    this.app.io.emit('new_whatsapp_message', { ...savedMessage, conversationId: conversation.id });

    return savedMessage;
  }


  // --- DOWNLOAD DA META (O PASSO QUE FALTAVA) ---
  public async downloadMediaFromMeta(mediaId: string): Promise<Buffer> {
    // Passo A: Pegar a URL de download
    const urlRes = await fetch(`https://graph.facebook.com/${this.version}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    const urlJson: any = await urlRes.json();

    if (!urlJson.url) throw new Error('URL de mídia não encontrada na Meta');

    // Passo B: Baixar o binário usando a URL retornada (requer Auth também)
    const binaryRes = await fetch(urlJson.url, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });

    const arrayBuffer = await binaryRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // --- Auxiliar: Checklist de Pendências ---
  // private async getDocumentosPendentes(conversationId: string) {

  //   const docs = await prisma.conversationDocument.findMany({
  //     where: {
  //       conversationId,
  //       etapa: 'ESSENCIAL',
  //       validado: true,
  //     },
  //     select: { tipo: true },
  //   });

  //   const recebidos = docs.map(d => normalizarTipoDocumento(d.tipo));

  //   const checklistBase = ['RG', 'COMP_RES'];

  //   return checklistBase.filter(d => !recebidos.includes(d));
  // }
  public async getDocumentosPendentes(conversationId: string) {
    const docs = await prisma.conversationDocument.findMany({
      where: {
        conversationId,
        etapa: 'ESSENCIAL',
        validado: true,
      },
      select: {
        tipo: true,
        extractedData: true,
      },
    });

    const pendentes: string[] = [];

    // ======================
    // IDENTIDADE (RG ou CNH)
    // ======================
    const docsIdentidade = docs.filter(
      d => d.tipo === 'RG' || d.tipo === 'CNH'
    );

    const temDocumentoUnico = docsIdentidade.some(
      (d: any) => d.extractedData?.lado === 'FRENTE_E_VERSO'
    );

    const temFrente = docsIdentidade.some(
      (d: any) => d.extractedData?.lado === 'FRENTE'
    );

    const temVerso = docsIdentidade.some(
      (d: any) => d.extractedData?.lado === 'VERSO'
    );

    const identidadeCompleta =
      temDocumentoUnico || (temFrente && temVerso);

    if (!identidadeCompleta) {
      pendentes.push('RG'); // texto: "RG ou CNH"
    }

    // ======================
    // Comprovante de residência
    // ======================
    const temCompRes = docs.some(d => d.tipo === 'COMP_RES');

    if (!temCompRes) {
      pendentes.push('COMP_RES');
    }

    return pendentes;
  }


  // --- Auxiliar: Atualiza Stats da Conversa ---
  private async updateConversationStats(id: string, lastBody: string) {
    await prisma.conversation.update({
      where: { id },
      data: {
        unreadCount: { increment: 1 },
        lastMessageBody: lastBody,
        lastMessageTime: new Date()
      }
    });
  }

  // ===========================================================================
  // 3. MÉTODOS DE LEITURA E AÇÃO (Mantidos iguais ao seu código original)
  // ===========================================================================

  async listarConversas() {
    const conversas = await prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
        attendant: { select: { id: true, nome: true } }
      }
    });

    return conversas.map(c => {
      const lastMsg = c.messages?.[0];

      return {
        id: c.id,
        status: c.status,
        channel: c.channel,
        unreadCount: c.unreadCount,
        tags: c.tags,
        updatedAt: c.updatedAt,

        // 👤 CLIENTE NORMALIZADO
        cliente: {
          nome: c.customerName || c.customerPhone || 'Cliente sem nome',
          telefone: c.customerPhone,
          avatar: c.customerAvatar || null
        },

        // 💬 ÚLTIMA MENSAGEM
        ultimaMensagem: lastMsg?.content || c.lastMessageBody || '',
        ultimaMensagemEm: lastMsg?.createdAt || c.lastMessageTime,

        attendantId: c.attendantId,
        attendant: c.attendant
      };
    });
  }

  async getConversationById(id: string) {
    return prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        attendant: { select: { id: true, nome: true } }
      }
    });
  }

  async updateConversation(id: string, data: any) {
    return prisma.conversation.update({ where: { id }, data });
  }

  async updateCustomerData(id: string, data: { nome: string; telefone: string }) {
    return prisma.conversation.update({
      where: { id },
      data: { customerName: data.nome }
    });
  }

  async markConversationAsRead(id: string) {
    await prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 }
    });
  }

  async sendTextByConversationId(conversationId: string, text: string) {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new Error('Conversa não encontrada');
    return this.sendText(conversation.customerPhone, text, conversationId);
  }

  async sendFileByConversationId(conversationId: string, filePath: string, mimeType: string, fileName: string) {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new Error('Conversa não encontrada');
    return this.sendFile(conversation.customerPhone, filePath, mimeType, fileName, conversationId);
  }

  // ===========================================================================
  // 4. MÉTODOS CORE DE ENVIO (Mantidos)
  // ===========================================================================

  private async sendText(to: string, text: string, conversationId?: string) {
    const payload: MetaMessagePayload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text, preview_url: true }
    };
    const metaResponse: any = await this.callMetaApi('/messages', 'POST', payload);

    if (metaResponse.error) throw new Error(metaResponse.error.message);
    if (!metaResponse.messages?.[0]?.id) throw new Error('Mensagem não aceita pela Meta');

    if (!conversationId) {
      const conv = await this.findOrCreateConversation(to);
      conversationId = conv.id;
    }

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

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageBody: text, lastMessageTime: new Date() }
    });

    return savedMessage;
  }

  // private async sendFile(to: string, filePath: string, mimeType: string, fileName: string, conversationId?: string) {
  //   const mediaId = await this.uploadMediaToMeta(filePath, mimeType);
  //   const payload: MetaMessagePayload = {
  //     messaging_product: 'whatsapp',
  //     to,
  //     type: 'document',
  //     document: { id: mediaId, filename: fileName }
  //   };

  //   if (mimeType.includes('image')) {
  //     payload.type = 'image';
  //     delete payload.document;
  //     payload.image = { id: mediaId };
  //   }

  //   const metaResponse: any = await this.callMetaApi('/messages', 'POST', payload);

  //   if (!conversationId) {
  //     const conv = await this.findOrCreateConversation(to);
  //     conversationId = conv.id;
  //   }

  //   return prisma.message.create({
  //     data: {
  //       wa_id: metaResponse.messages?.[0]?.id,
  //       content: fileName,
  //       role: 'AGENT',
  //       type: mimeType.includes('image') ? 'image' : 'document',
  //       status: 'sent',
  //       fileName: fileName,
  //       conversationId: conversationId!
  //     }
  //   });
  // }

  // ===========================================================================
  // 5. HELPERS GERAIS
  // ===========================================================================
  // ===========================================================================
  // CORREÇÃO: Método legado 'sendFile' adaptado para a nova assinatura
  // ===========================================================================

  private async sendFile(to: string, filePath: string, mimeType: string, fileName: string, conversationId?: string) {

    // 1. Ler o arquivo local para Buffer (pois uploadMediaToMeta agora exige Buffer)
    const fs = require('fs');
    const fileBuffer = fs.readFileSync(filePath);

    // 2. Agora chamamos passando o Buffer e o fileName (3 argumentos)
    const mediaId = await this.uploadMediaToMeta(fileBuffer, mimeType, fileName);

    // 3. Monta o payload
    const payload: MetaMessagePayload = {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { id: mediaId, filename: fileName }
    };

    // Ajuste de tipo (Imagem vs Audio vs Documento)
    if (mimeType.includes('image')) {
      payload.type = 'image';
      delete payload.document;
      payload.image = { id: mediaId };
    } else if (mimeType.includes('audio') || mimeType.includes('ogg')) {
      payload.type = 'audio';
      delete payload.document;
      payload.audio = { id: mediaId };
    }

    const metaResponse: any = await this.callMetaApi('/messages', 'POST', payload);

    if (!conversationId) {
      const conv = await this.findOrCreateConversation(to);
      conversationId = conv.id;
    }

    return prisma.message.create({
      data: {
        wa_id: metaResponse.messages?.[0]?.id,
        content: fileName,
        role: 'AGENT',
        type: this.mapMimeTypeToPrismaType(mimeType), // Usa o helper novo
        status: 'sent',
        fileName: fileName,
        conversationId: conversationId!
      }
    });
  }
  private async findOrCreateConversation(phone: string, name?: string) {
    let conversation = await prisma.conversation.findUnique({ where: { customerPhone: phone } });
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

  // private async uploadMediaToMeta(filePath: string, mimeType: string): Promise<string> {
  //   const form = new FormData();
  //   const fileBuffer = fs.readFileSync(filePath);
  //   const fileBlob = new Blob([fileBuffer], { type: mimeType });

  //   form.append('file', fileBlob, 'upload.file');
  //   form.append('type', mimeType);
  //   form.append('messaging_product', 'whatsapp');

  //   const response = await fetch(`https://graph.facebook.com/${this.version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
  //     method: 'POST',
  //     headers: { 'Authorization': `Bearer ${this.token}` },
  //     body: form
  //   });

  //   if (!response.ok) throw new Error('Falha no upload para Meta');
  //   const data: any = await response.json();
  //   return data.id;
  // }

  // --- Auxiliar: Upload para Meta (Versão Buffer) ---
  private async uploadMediaToMeta(fileBuffer: Buffer, mimeType: string, fileName: string): Promise<string> {
    // Usa o FormData nativo do Node.js
    const form = new FormData();

    // Converte o Buffer para Blob, que é o formato nativo exigido pelo fetch moderno
    const fileBlob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
    // A sintaxe nativa não usa objeto de opções, passamos o nome direto no terceiro parâmetro
    form.append('file', fileBlob, fileName);
    form.append('type', mimeType);
    form.append('messaging_product', 'whatsapp');

    const response = await fetch(`https://graph.facebook.com/${this.version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
        // IMPORTANTE: NÃO passamos mais o ...form.getHeaders() nem Content-Type.
        // O fetch nativo é inteligente e cria o multipart/form-data com o boundary correto sozinho.
      },
      body: form // Agora sim o TypeScript aceita!
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Erro Upload Meta:', errorData);
      throw new Error('Falha no upload para Meta');
    }

    const data: any = await response.json();
    return data.id;
  }

  private async callMetaApi(endpoint: string, method: string, body: any) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json(); // 🔥 LÊ UMA ÚNICA VEZ

    if (!res.ok) {
      console.error('❌ ERRO META:', json);
      throw new Error(JSON.stringify(json));
    }

    return json; // ✅ retorna o mesmo objeto já lido
  }


  async markAsRead(messageId: string) {
    try {
      await this.callMetaApi('/messages', 'POST', {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      });
    } catch (error: any) {
      // Apenas avisa no console, mas NÃO derruba a aplicação
      console.warn(`⚠️ [Aviso] Falha de rede ao marcar mensagem como lida. Vida que segue...`, error.message);
    }
  }

  // --- Helper para mapear tipos MIME para o Enum do Prisma ---
  private mapMimeTypeToPrismaType(mime: string): 'text' | 'image' | 'document' | 'audio' {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/') || mime.includes('ogg') || mime.includes('opus')) return 'audio';
    return 'document';
  }

  async transcreverAudio(audioBuffer: Buffer, fileName: string): Promise<string> {
    try {
      console.log('🎙️ [ÁUDIO] Enviando para transcrição (OpenAI Whisper)...');

      const file = await toFile(audioBuffer, fileName);

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
        language: "pt",
      });

      console.log(`✨ [ÁUDIO TRANSCRITO]: "${transcription.text}"`);
      return transcription.text;

    } catch (error) {
      console.error('❌ Erro ao transcrever áudio:', error);
      return "";
    }
  }

}