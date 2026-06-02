import { Job, Worker } from 'bullmq';

import { prisma } from '@/lib/prisma.js';

// Importe seus serviços
import { ChatbotService } from '../services/chatbot/chatbot-service.js';
// Você precisará expor os métodos de download/envio no seu WhatsappService

import { StorageService } from '../services/storage.service.js';
import { DocumentAnalysisService } from '../services/document-analysis.service.js';
import { normalizarTipoDocumento } from '../services/utils/documentos.js';
import type { WhatsappService } from '@/modules/whatsapp/whatsapp.service.js';
import { redis } from '../redis/redis.js';

// Instâncias
const chatbotService = new ChatbotService();
const storageService = new StorageService();
const docAnalysisService = new DocumentAnalysisService();
// Nota: Dependendo de como seu app Fastify está estruturado, você pode precisar 
// instanciar o WhatsappService passando o app/io se ele for necessário fora do escopo http
let whatsappService: WhatsappService;

export function initWhatsappWorker(waService: WhatsappService) {
    whatsappService = waService; // Injetando o serviço para usar os métodos de envio

    console.log('⚖️ [Worker] Inicializando Legal Chatbot Worker...');

    const worker = new Worker(
        'legal-whatsapp-queue',
        async (job: Job) => {
            const { messageData, customerPhone, customerName } = job.data;

            // ── 1. Sistema de Lock (O Cadeado Anti-Concorrência) ───────────────
            // Garante que mensagens do MESMO cliente sejam processadas uma por vez.
            const lKey = `lock:legal:${customerPhone}`;
            const lock = await redis.set(lKey, '1', 'EX', 120, 'NX'); // Trava por 2 min

            // Renovador de Lock para processamentos demorados (ex: OCR lento ou Whisper)
            const lockRenewer = setInterval(async () => {
                await redis.expire(lKey, 120);
            }, 30_000);

            if (!lock) {
                // Se o cliente já está sendo processado, devolve o Job pra fila 
                // com um atraso de 2 segundos para tentar de novo.
                await job.moveToDelayed(Date.now() + 2000);
                return;
            }

            try {
                // ── 2. Garantir a Conversa no Banco ──────────────────────────────
                const conversation = await prisma.conversation.upsert({
                    where: { customerPhone },
                    create: {
                        customerPhone,
                        customerName: customerName || customerPhone,
                        status: 'OPEN',
                        channel: 'whatsapp',
                        unreadCount: 1,
                    },
                    update: {
                        customerName: customerName || undefined,
                        unreadCount: { increment: 1 },
                    },
                });

                // ── 3. Parse da Mensagem (Texto, Botão ou Mídia?) ────────────────
                let textoFinal = '';
                const mediaTypes = ['image', 'document', 'audio', 'voice', 'ptt', 'video'];
                const isMedia = mediaTypes.includes(messageData.type);

                if (isMedia) {
                    console.log(`[Worker] 📎 Mídia recebida de ${customerName}. Tipo: ${messageData.type}`);
                    await processarMidiaNoWorker(messageData, conversation, customerPhone);
                    return; // A lógica de mídia encerra aqui!
                }

                if (messageData.type === 'interactive') {
                    // Extrai o clique do botão
                    const btnId = messageData.interactive?.button_reply?.id || messageData.interactive?.list_reply?.id;
                    textoFinal = btnId || '';
                    console.log(`[Worker] 🔘 Botão clicado: ${textoFinal}`);
                } else if (messageData.type === 'text') {
                    textoFinal = messageData.text?.body || '';
                } else {
                    console.log(`[Worker] ⚠️ Tipo não suportado: ${messageData.type}`);
                    return;
                }

                if (!textoFinal) return;

                // ── 4. Salva a mensagem do cliente no banco ──────────────────────
                const savedMessage = await prisma.message.create({
                    data: {
                        wa_id: messageData.id,
                        content: messageData.type === 'interactive' ? `[Botão Clicado: ${textoFinal}]` : textoFinal,
                        role: 'USER',
                        type: 'text',
                        status: 'read',
                        conversationId: conversation.id,
                    },
                });

                // Atualiza UI em tempo real
                whatsappService.app?.io?.emit('new_whatsapp_message', { ...savedMessage, conversationId: conversation.id });

                // ── 5. Atendimento Humano vs IA ──────────────────────────────────
                if (conversation.attendantId) {
                    console.log(`[Worker] 👨‍💻 Sessão com humano. Ignorando IA para ${customerPhone}`);
                    return;
                }

                // Chama o ChatbotService (que agora já tem seus interceptadores de botões!)
                const aiResponse = await chatbotService.chat(textoFinal, customerPhone);

                if (aiResponse) {
                    await whatsappService.sendTextByConversationId(conversation.id, aiResponse);
                }

            } catch (error) {
                console.error(`❌ [Worker] Falha no Job ${job.id}:`, error);
                throw error;
            } finally {
                // ── 6. Libera o Cadeado (MUITO IMPORTANTE) ───────────────────────
                clearInterval(lockRenewer);
                await redis.del(lKey);
            }
        },
        {
            connection: redis,
            lockDuration: 60000,
        }
    );

    worker.on('failed', (job: Job | undefined, err: Error) => console.error(`🚨 [Worker] Job ${job?.id} falhou:`, err));
    worker.on('completed', (job: Job) => console.log(`✅ [Worker] Job ${job.id} concluído.`));
}

// ============================================================================
// LÓGICA ISOLADA DE MÍDIA (Migrada do Webhook para o Worker)
// ============================================================================
async function processarMidiaNoWorker(message: any, conversation: any, customerPhone: string) {
    const workflowStep = conversation.workflowStep?.trim();
    const mediaId = message[message.type]?.id;
    const mimeType = message[message.type]?.mime_type || 'application/octet-stream';
    const fileName = message.document?.filename || `${message.type}_${Date.now()}`;

    if (!mediaId) return;

    // UX imediato para imagem/pdf
    if (workflowStep === 'COLETA_DOCS' && !['audio', 'voice'].includes(message.type)) {
        await whatsappService.sendTextByConversationId(conversation.id, 'Recebi seu arquivo! 📎\nAnalisando a qualidade, aguarde um instante...');
    }

    // 1. Download e Upload pro R2
    const fileBuffer = await whatsappService.downloadMediaFromMeta(mediaId); // Exponha isso no WhatsappService
    const extension = fileName.split('.').pop() || 'bin';
    const folder = `clientes/${customerPhone}`;

    const uploadResult = await storageService.uploadFile(fileBuffer, extension, folder);

    // 2. Se for Áudio (Whisper)
    if (['audio', 'voice', 'ptt'].includes(message.type) && workflowStep !== 'COLETA_DOCS_EXTRA') {
        const textoTranscrito = await whatsappService.transcreverAudio(fileBuffer, fileName);

        if (textoTranscrito) {
            // Salva transcrição no histórico
            await prisma.message.create({
                data: { wa_id: `${message.id}_trans`, content: `🎤 Áudio transcrito: "${textoTranscrito}"`, role: 'USER', type: 'text', status: 'read', conversationId: conversation.id }
            });

            // Roda a IA com o texto transcrito
            const aiResponse = await chatbotService.chat(textoTranscrito, customerPhone);
            if (aiResponse) await whatsappService.sendTextByConversationId(conversation.id, aiResponse);
        } else {
            await whatsappService.sendTextByConversationId(conversation.id, 'Desculpe, não consegui entender o áudio. Pode digitar?');
        }
        // Salva o audio como prova complementar
        await salvarDocumentoNoBanco(conversation.id, 'AUDIO_WHATSAPP', 'COMPLEMENTAR', uploadResult.url, fileName, mimeType, true, {});
        return;
    }

    // 3. Processamento de OCR (Só se for Imagem na fase essencial)
    let tipoDocumento: any = 'COMPLEMENTAR';
    let etapaDocumento: 'ESSENCIAL' | 'COMPLEMENTAR' = 'COMPLEMENTAR';
    let analiseIA: any = null;

    if (workflowStep === 'COLETA_DOCS' && message.type === 'image') {
        etapaDocumento = 'ESSENCIAL';
        analiseIA = await docAnalysisService.analyzeDocument(fileBuffer);

        if (!analiseIA || !analiseIA.legivel || analiseIA.tipo_identificado === 'OUTROS') {
            await whatsappService.sendTextByConversationId(conversation.id, '⚠️ A foto ficou ilegível ou não reconheci o documento. Pode tirar outra foto com mais foco e iluminação?');
            return;
        }

        if (analiseIA.tipo_identificado === 'RG') tipoDocumento = 'RG';
        else if (analiseIA.tipo_identificado === 'CNH') tipoDocumento = 'CNH';
        else if (analiseIA.tipo_identificado === 'COMPROVANTE_RESIDENCIA') tipoDocumento = 'COMP_RES';
    }

    tipoDocumento = normalizarTipoDocumento(tipoDocumento);

    // 4. Salva no Banco de Documentos
    await salvarDocumentoNoBanco(
        conversation.id, tipoDocumento, etapaDocumento, uploadResult.url, fileName, mimeType,
        etapaDocumento === 'COMPLEMENTAR' ? true : analiseIA?.legivel ?? false,
        etapaDocumento === 'ESSENCIAL' ? analiseIA ?? {} : {}
    );

    // Lógica de Patch na tempData e Validação de RG/CPF vai aqui (a mesma que já tem no seu código atual)
    // ...

    // 5. UX e Botões Pós-Mídia
    const pendentesAgora = await whatsappService.getDocumentosPendentes(conversation.id);

    if (workflowStep === 'COLETA_DOCS_EXTRA') {
        // Agora mandamos o botão!
        await whatsappService.sendInteractiveTextMessage(
            customerPhone,
            'Mídia recebida e guardada no seu processo! 📎\n\nVocê tem mais alguma prova para enviar ou podemos seguir para a assinatura?',
            [
                { id: 'BTN_ENVIAR_MAIS', title: '📎 Enviar mais provas' },
                { id: 'BTN_FINALIZAR_PROVAS', title: '🚀 Finalizar envio' }
            ],
            conversation.id
        );
    } else if (pendentesAgora.length === 0) {
        // Avança automático se não faltar nada
        const promptDoBot = `[SISTEMA]: Perfeito! Recebemos todas as documentações básicas. Explique que agora ele pode enviar provas adicionais e direcione para clicar no botão de finalizar.`;
        const aiResponse = await chatbotService.chat(promptDoBot, customerPhone);
        if (aiResponse) await whatsappService.sendTextByConversationId(conversation.id, aiResponse);
    } else {
        // Pede o próximo documento
        let nomeProximo = pendentesAgora[0] === 'RG' ? 'RG ou CNH (foto legível)' : 'Comprovante de Residência';
        const feedback = analiseIA && !analiseIA.legivel ? `A imagem enviada ficou um pouco ilegível.` : `Recebido com sucesso.`;
        const promptDoBot = `[SISTEMA]: ${feedback}. Peça imediatamente o próximo documento: ${nomeProximo}.`;
        const aiResponse = await chatbotService.chat(promptDoBot, customerPhone);
        if (aiResponse) await whatsappService.sendTextByConversationId(conversation.id, aiResponse);
    }
}

// Função utilitária para limpar o código
async function salvarDocumentoNoBanco(conversationId: string, tipo: string, etapa: string, url: string, fileName: string, mimeType: string, validado: boolean, extractedData: any) {
    await prisma.conversationDocument.create({
        data: {
            conversationId,
            tipo,
            etapa: etapa as any,
            mediaUrl: url,
            fileName,
            mimeType,
            validado,
            extractedData,
        },
    });
}