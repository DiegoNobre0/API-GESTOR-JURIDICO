import { prisma } from '../../lib/prisma.js';
import { ChatbotService } from '../../infra/services/chatbot-service.js';
import { StorageService } from '../../infra/services/storage.service.js'; // <--- IMPORTANTE

import FormData from 'form-data';
import fetch from 'node-fetch';
import type { FastifyInstance } from 'fastify';
import type { IncomingMessage, MetaMessagePayload } from './whatsapp.types.js';
import { DocumentAnalysisService } from '../../infra/services/document-analysis.service.js';
import { normalizarTipoDocumento } from '../../infra/services/utils/documentos.js';


interface AnaliseDocumento {
  legivel: boolean;
  lado?: 'FRENTE' | 'VERSO' | 'FRENTE_E_VERSO';
  camposExtraidos: {
    nome?: string;
    rg?: string;
    cpf?: string;
  };
}

export class WhatsappService {
  private version = 'v19.0';
  private baseUrl = `https://graph.facebook.com/${this.version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
  private token = process.env.WHATSAPP_ACCESS_TOKEN;
  private storageService: StorageService; // <--- Instância do Storage
  private docAnalysisService: DocumentAnalysisService;

  constructor(
    private app: FastifyInstance,
    private chatbotService: ChatbotService
  ) {
    this.storageService = new StorageService();
    this.docAnalysisService = new DocumentAnalysisService();
  }

  // ===========================================================================
  // 1. WEBHOOK (O CORAÇÃO DA MUDANÇA)
  // ===========================================================================

  // ===========================================================================
  // 1. WEBHOOK (CORREÇÃO DE FLUXO)
  // ===========================================================================

  async processWebhook(body: any) {
    const changes = body.entry?.[0]?.changes?.[0];
    if (!changes) return;

    const value = changes.value;
    const message = value.messages?.[0] as IncomingMessage;
    const contactName = value.contacts?.[0]?.profile?.name || 'Cliente WhatsApp';

    if (message) {
      // 1. Marca como Lido (Feedback visual)
      await this.markAsRead(message.id);

      // 2. Encontra ou Cria a Conversa
      const conversation = await this.findOrCreateConversation(message.from, contactName);

      // 3. DETECÇÃO DE MÍDIA (AQUI ESTÁ A CORREÇÃO)
      const mediaTypes = ['image', 'document', 'audio', 'voice', 'ptt'];
      const isMedia = mediaTypes.includes(message.type);

      if (isMedia) {
        console.log(`📥 Mídia detectada de ${contactName}. Iniciando processamento...`);

        // CHAMA O HANDLER E ENCERRA A EXECUÇÃO AQUI
        // Isso impede que o código desça e mande "[Desconhecido]" para a IA
        await this.handleIncomingMedia(message, conversation);
        return;
      }

      // --- DAQUI PARA BAIXO É SÓ PARA TEXTO ---

      // Se chegou aqui, garantimos que é texto ou audio/outro
      // Se for desconhecido (ex: sticker), ignoramos para não confundir a IA
      if (message.type !== 'text') {
        console.log(`⚠️ Tipo de mensagem ignorado: ${message.type}`);
        return;
      }

      const content = message.text?.body || '';

      if (!content) return; // Se não tem texto, não faz nada

      // 4. Salva Mensagem de TEXTO no Banco
      const savedMessage = await prisma.message.create({
        data: {
          wa_id: message.id,
          content: content,
          role: 'USER',
          type: 'text',
          status: 'read',
          conversationId: conversation.id,
        }
      });

      await this.updateConversationStats(conversation.id, content);

      // Emite Socket
      this.app.io.emit('new_whatsapp_message', { ...savedMessage, conversationId: conversation.id });

      // 5. IA Chatbot (Apenas se não tiver atendente humano)
      if (!conversation.attendantId) {
        const aiResponse: any = await this.chatbotService.chat(content, message.from);

        // Envia a resposta da IA
        if (aiResponse) {
          await this.sendText(message.from, aiResponse, conversation.id);
        }
      }
    }
  }

  // ===========================================================================
  // LÓGICA DE PROCESSAMENTO DE MÍDIA
  // ===========================================================================

  // private async handleIncomingMedia(message: IncomingMessage, conversation: any) {
  //   try {

  //     const etapasAceitas = ['COLETA_DOCS', 'COLETA_DOCS_EXTRA'];

  //     const workflowStep = conversation.workflowStep?.trim();

  //     if (!etapasAceitas.includes(workflowStep)) {
  //       await this.sendText(
  //         conversation.customerPhone,
  //         'Já recebi 👍 Vou analisar esse documento assim que chegarmos na etapa correta, tudo bem?',
  //         conversation.id
  //       );
  //       return;
  //     }
  //     // 1. [UX] Feedback Imediato: Avisa que recebeu antes de processar
  //     await this.sendText(
  //       conversation.customerPhone,
  //       "Recebi seu documento! \nEstou analisando a imagem para validar os dados, aguarde um instante...",
  //       conversation.id
  //     );

  //     // 2. Identificar ID e MimeType com Segurança
  //     let mediaId = '';
  //     let mimeType = '';
  //     let mediaType: 'image' | 'document' | 'audio' = 'document';
  //     let fileName = '';

  //     switch (message.type) {
  //       case 'image':
  //         mediaId = message.image?.id || '';
  //         mimeType = message.image?.mime_type || 'image/jpeg';
  //         mediaType = 'image';
  //         fileName = `imagem_${Date.now()}`;
  //         break;

  //       case 'document':
  //         mediaId = message.document?.id || '';
  //         mimeType = message.document?.mime_type || 'application/pdf';
  //         mediaType = 'document';
  //         fileName = message.document?.filename || `documento_${Date.now()}`;
  //         break;

  //       case 'audio':
  //       case 'voice':
  //       case 'ptt':
  //         mediaId = message.audio?.id || '';
  //         mimeType = message.audio?.mime_type || 'audio/ogg';
  //         mediaType = 'audio';
  //         fileName = `audio_${Date.now()}.ogg`;
  //         break;
  //     }


  //     // Se não for imagem nem documento (ex: áudio, sticker), ignora ou trata diferente
  //     if (!mediaId) return;

  //     // 3. Baixar buffer da Meta
  //     const fileBuffer = await this.downloadMediaFromMeta(mediaId);

  //     // 4. Descobrir contexto (O que falta?)
  //     const pendentes = await this.getDocumentosPendentes(conversation.id);
  //     // Se tiver pendências, assume que é a primeira. Se não, marca como EXTRA.
  //     const docTypeContext = pendentes[0] ?? 'DOCUMENTO_EXTRA';

  //     // 5. Upload R2
  //     const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  //     const folder = `clientes/${conversation.customerPhone}`;
  //     const uploadResult = await this.storageService.uploadFile(fileBuffer, extension, folder);

  //     // 6. Análise de IA (OCR)
  //     let analiseIA = null;

  //     if (docTypeContext !== 'DOCUMENTO_EXTRA') {
  //       analiseIA = await this.docAnalysisService.analyzeDocument(
  //         fileBuffer,
  //         docTypeContext
  //       );
  //     }

  //     // 7. Salvar na tabela ConversationDocument (Link para o advogado)
  //     const isExtra = docTypeContext === 'DOCUMENTO_EXTRA';

  //     await prisma.conversationDocument.create({
  //       data: {
  //         conversationId: conversation.id,

  //         tipo: isExtra ? 'DOCUMENTO' : docTypeContext,
  //         etapa: isExtra ? 'COMPLEMENTAR' : 'ESSENCIAL',

  //         mediaUrl: uploadResult.url,
  //         fileName: isExtra
  //           ? `extra_${Date.now()}.${extension}`
  //           : `${docTypeContext}.${extension}`,

  //         mimeType,

  //         validado: isExtra ? true : analiseIA?.legivel || false,
  //         extractedData: isExtra ? {} : analiseIA ?? {},
  //       }
  //     });

  //     // 8. Salvar dados extraídos SOMENTE se for documento obrigatório
  //     if (
  //       docTypeContext !== 'DOCUMENTO_EXTRA' &&
  //       analiseIA &&
  //       analiseIA.legivel
  //     ) {
  //       await prisma.conversation.update({
  //         where: { id: conversation.id },
  //         data: {
  //           tempData: {
  //             ...(conversation.tempData as object ?? {}),
  //             [`extracted_${docTypeContext}_nome`]: analiseIA.nome_completo,
  //             [`extracted_${docTypeContext}_rg`]: analiseIA.rg_numero,
  //             [`extracted_${docTypeContext}_cpf`]: analiseIA.cpf_numero,
  //             [`extracted_${docTypeContext}_endereco`]: analiseIA.endereco_completo,
  //             [`extracted_${docTypeContext}_legivel`]: true
  //           }
  //         }
  //       });

  //       console.log(`✅ Dados extraídos do ${docTypeContext}:`, analiseIA);
  //     }

  //     // 9. Registrar mensagem visual no chat (Para aparecer no front)
  //     const savedMessage = await prisma.message.create({
  //       data: {
  //         wa_id: message.id,
  //         content: uploadResult.url, // 🔥 URL do arquivo
  //         role: 'USER',
  //         type: mediaType,           // 'image' | 'document' | 'audio'
  //         status: 'read',
  //         conversationId: conversation.id,
  //         fileName: `${docTypeContext}.${extension}`,
  //       }
  //     });

  //     // Socket update
  //     this.app.io.emit('new_whatsapp_message', { ...savedMessage, conversationId: conversation.id });

  //     // 10. Construção do Prompt para o Bot
  //     let promptDoBot = '';

  //     if (docTypeContext === 'DOCUMENTO_EXTRA') {
  //       promptDoBot = `[SISTEMA]: O usuário enviou um documento complementar ao caso.
  // Agradeça o envio e diga que esse material ajudará a fortalecer a análise jurídica.
  // Pergunte se deseja enviar mais alguma prova ou se prefere finalizar digitando FINALIZAR.`;
  //     }

  //     if (analiseIA && !analiseIA.legivel) {
  //       // Cenário A: IA não conseguiu ler
  //       promptDoBot = `[SISTEMA]: O usuário enviou uma imagem do ${docTypeContext}, mas a IA Vision marcou como ILEGÍVEL/BORRADA. 
  //       Agradeça o envio, mas peça gentilmente para enviar uma foto mais nítida, sem reflexos e bem iluminada.`;
  //     }
  //     else if (analiseIA) {
  //       // Cenário B: IA leu com sucesso (Confirmação)
  //       // Formata os dados para o bot ler de forma limpa
  //       const dadosLidos = `
  //         - Nome: ${analiseIA.nome_completo || 'Não identificado'}
  //         - CPF: ${analiseIA.cpf_numero || 'Não identificado'}
  //         - RG: ${analiseIA.rg_numero || 'Não identificado'}
  //       `;

  //       promptDoBot = `[SISTEMA]: O usuário enviou o ${docTypeContext}.
  //       A IA leu os seguintes dados: ${dadosLidos}.

  //       AÇÃO: Agradeça e peça para o cliente CONFIRMAR se esses dados (Nome e CPF) estão corretos para o contrato. 
  //       Se estiverem corretos, ele deve responder "Sim".`;
  //     }
  //     else {
  //       // Cenário C: Fallback (Erro na API da IA ou retorno null)
  //       promptDoBot = `[SISTEMA]: O usuário enviou o ${docTypeContext}, mas não consegui ler os dados automaticamente. 
  //       Agradeça o envio e pergunte se a foto está legível para ele.`;
  //     }

  //     // 11. Aciona o Bot
  //     const aiResponse: any = await this.chatbotService.chat(promptDoBot, conversation.customerPhone);

  //     if (aiResponse) {
  //       await this.sendText(conversation.customerPhone, aiResponse, conversation.id);
  //     }

  //   } catch (error) {
  //     console.error('❌ Erro processamento mídia:', error);
  //     // Mensagem amigável de erro
  //     await this.sendText(conversation.customerPhone, 'Tive uma pequena instabilidade ao processar seu arquivo. Por favor, tente reenviar a foto.', conversation.id);
  //   }
  // }

  private async handleIncomingMedia(
    message: IncomingMessage,
    conversation: any
  ) {
    try {
      const workflowStep = conversation.workflowStep?.trim();

      const fasesDocs = ['COLETA_DOCS', 'COLETA_DOCS_EXTRA'];
      const estaEmFaseDeDocs = fasesDocs.includes(workflowStep);

      // ============================
      // UX – feedback imediato APENAS se estiver em fase de docs
      // ============================
      if (workflowStep === "COLETA_DOCS") {
        await this.sendText(
          conversation.customerPhone,
          'Recebi seu arquivo! 📎\nEstou analisando e validando, aguarde um instante...',
          conversation.id
        );
      }

      // ============================
      // Identificação da mídia
      // ============================
      let mediaId = '';
      let mimeType = '';
      let mediaType: 'image' | 'document' | 'audio' = 'document';
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
          fileName =
            message.document?.filename || `documento_${Date.now()}.pdf`;
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


      if (!mediaId) return;

      // ============================
      // Download + Upload
      // ============================
      const fileBuffer = await this.downloadMediaFromMeta(mediaId);

      // // ============================
      // // 🔊 ÁUDIO → TRANSCRIÇÃO
      // // ============================
      // if (mediaType === 'audio') {

      //   // (opcional) upload cloud
      //   const extension = fileName.split('.').pop() || 'ogg';
      //   const folder = `clientes/${conversation.customerPhone}`;
      //   const uploadResult = await this.storageService.uploadFile(
      //     fileBuffer,
      //     extension,
      //     folder
      //   );

      //   // salva o áudio
      //   await prisma.message.create({
      //     data: {
      //       wa_id: message.id,
      //       content: uploadResult.url,
      //       role: 'USER',
      //       type: 'audio',
      //       status: 'read',
      //       conversationId: conversation.id,
      //       fileName,
      //     }
      //   });

      //   // transcrição
      //   const textoTranscrito =
      //     await this.chatbotService.transcreverAudio(fileBuffer, mimeType);

      //   // salva texto
      //   const savedText = await prisma.message.create({
      //     data: {
      //       wa_id: `${message.id}_transcript`,
      //       content: textoTranscrito,
      //       role: 'USER',
      //       type: 'text',
      //       status: 'read',
      //       conversationId: conversation.id,
      //     }
      //   });

      //   this.app.io.emit('new_whatsapp_message', {
      //     ...savedText,
      //     conversationId: conversation.id,
      //   });

      //   // IA responde
      //   if (!conversation.attendantId) {
      //     const aiResponse = await this.chatbotService.chat(
      //       textoTranscrito,
      //       conversation.customerPhone
      //     );

      //     if (aiResponse) {
      //       await this.sendText(
      //         conversation.customerPhone,
      //         aiResponse,
      //         conversation.id
      //       );
      //     }
      //   }

      //   return; // 🔴 CRÍTICO
      // }

      const extension = fileName.split('.').pop() || 'bin';
      const folder = `clientes/${conversation.customerPhone}`;

      const uploadResult = await this.storageService.uploadFile(
        fileBuffer,
        extension,
        folder
      );

      // ============================
      // Definição de contexto do documento
      // ============================
      let tipoDocumento: any = 'COMPLEMENTAR';
      let etapaDocumento: 'ESSENCIAL' | 'COMPLEMENTAR' = 'COMPLEMENTAR';
      let analiseIA: any = null;

      // Apenas na fase COLETA_DOCS existe documento obrigatório
      if (workflowStep === 'COLETA_DOCS') {
        const pendentes = await this.getDocumentosPendentes(conversation.id);

        if (pendentes.length > 0) {
          tipoDocumento = pendentes[0];
          etapaDocumento = 'ESSENCIAL';

          analiseIA = await this.docAnalysisService.analyzeDocument(
            fileBuffer,
            tipoDocumento
          );

          if (analiseIA?.legivel) {
            if (analiseIA.tipo_identificado === 'CNH') tipoDocumento = 'CNH';
            if (analiseIA.tipo_identificado === 'RG') tipoDocumento = 'RG';
            if (analiseIA.tipo_identificado === 'COMPROVANTE_RESIDENCIA')
              tipoDocumento = 'COMP_RES';
          }
        }
      }

      // ============================
      // Persistência do documento
      // ============================

      tipoDocumento = normalizarTipoDocumento(tipoDocumento);

      await prisma.conversationDocument.create({
        data: {
          conversationId: conversation.id,
          tipo: tipoDocumento,
          etapa: etapaDocumento,
          mediaUrl: uploadResult.url,
          fileName: `${tipoDocumento}.${extension}`,
          mimeType,
          validado: etapaDocumento === 'COMPLEMENTAR'
            ? true
            : analiseIA?.legivel ?? false,
          extractedData:
            etapaDocumento === 'ESSENCIAL' ? analiseIA ?? {} : {},
        },
      });

      // ============================
      // Atualiza tempData (se OCR válido)
      // ============================
      if (
        etapaDocumento === 'ESSENCIAL' &&
        analiseIA &&
        analiseIA.legivel
      ) {
        const patch: any = {};

        if (analiseIA.lado === 'FRENTE_E_VERSO') {
          patch.extracted_RG_FRENTE_legivel = true;
          patch.extracted_RG_VERSO_legivel = true;
        }

        if (analiseIA.lado === 'FRENTE') {
          patch.extracted_RG_FRENTE_legivel = true;
        }

        if (analiseIA.lado === 'VERSO') {
          patch.extracted_RG_VERSO_legivel = true;
        }


        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            tempData: {
              ...(conversation.tempData as object ?? {}),
              [`extracted_${tipoDocumento}_nome`]:
                analiseIA.nome_completo,
              [`extracted_${tipoDocumento}_rg`]:
                analiseIA.rg_numero,
              [`extracted_${tipoDocumento}_cpf`]:
                analiseIA.cpf_numero,
              [`extracted_${tipoDocumento}_endereco`]:
                analiseIA.endereco_completo,
              [`extracted_${tipoDocumento}_legivel`]: true,
            },
          },

        });
        console.log(`✅ Dados extraídos do ${tipoDocumento}:`, analiseIA);

      }

      // ============================
      // Log da mensagem no chat
      // ============================
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

      this.app.io.emit('new_whatsapp_message', {
        ...savedMessage,
        conversationId: conversation.id,
      });

      // ============================
      // RESPOSTA DO BOT (somente em fases de docs)
      // ============================
      if (!estaEmFaseDeDocs) return;

      let promptDoBot = '';

      const pendentesAgora = await this.getDocumentosPendentes(
        conversation.id
      );

      // === FASE EXTRA ===
      if (workflowStep === 'COLETA_DOCS_EXTRA') {
        // Apenas confirma recebimento visual
        await this.sendText(
          conversation.customerPhone,
          'Recebi seu arquivo!',
          conversation.id
        );

        return; // 🔴 ISSO É CRÍTICO
      }

      // === ACABARAM OS OBRIGATÓRIOS AGORA ===
      else if (pendentesAgora.length === 0) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { workflowStep: 'COLETA_DOCS_EXTRA' },
        });

        const tipoCaso = conversation.tipoCaso || 'seu caso';

        promptDoBot = `
[SISTEMA]:
Perfeito! Recebemos todas as documentações básicas.
Explique que agora ele pode enviar provas adicionais (fotos, vídeos, áudios, prints) para reforçar ${tipoCaso}.
Diga que quando terminar, deve digitar FINALIZAR.
`;
      }

      // === AINDA FALTAM DOCUMENTOS ===
      else {
        const proximo = pendentesAgora[0];
        let nomeProximo = proximo;

        if (proximo === 'RG') nomeProximo = 'RG ou CNH (foto legível)';
        if (proximo === 'COMP_RES')
          nomeProximo = 'Comprovante de Residência';

        const feedback =
          analiseIA && !analiseIA.legivel
            ? `A imagem enviada ficou um pouco ilegível, mas seguimos com o processo.`
            : `Documento recebido com sucesso.`;

        promptDoBot = `
[SISTEMA]:
${feedback}
Peça imediatamente o próximo documento: ${nomeProximo}.
Seja claro e direto.
`;
      }

      const aiResponse = await this.chatbotService.chat(
        promptDoBot,
        conversation.customerPhone
      );

      if (aiResponse) {
        await this.sendText(
          conversation.customerPhone,
          aiResponse,
          conversation.id
        );
      }
    } catch (error) {
      console.error('❌ Erro processamento mídia:', error);

      await this.sendText(
        conversation.customerPhone,
        'Tive uma instabilidade ao processar o arquivo. Pode tentar reenviar?',
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
  private async downloadMediaFromMeta(mediaId: string): Promise<Buffer> {
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
  private async getDocumentosPendentes(conversationId: string) {
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
    const form = new FormData();

    // O 'file' precisa ter filename nas opções para a Meta aceitar corretamente
    form.append('file', fileBuffer, { filename: fileName, contentType: mimeType });
    form.append('type', mimeType);
    form.append('messaging_product', 'whatsapp');

    const response = await fetch(`https://graph.facebook.com/${this.version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        ...form.getHeaders() // Importante para o multipart/form-data funcionar com Buffer
      },
      body: form
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
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  async markAsRead(messageId: string) {
    await this.callMetaApi('/messages', 'POST', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    });
  }

  // --- Helper para mapear tipos MIME para o Enum do Prisma ---
  private mapMimeTypeToPrismaType(mime: string): 'text' | 'image' | 'document' | 'audio' {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/') || mime.includes('ogg') || mime.includes('opus')) return 'audio';
    return 'document';
  }

}