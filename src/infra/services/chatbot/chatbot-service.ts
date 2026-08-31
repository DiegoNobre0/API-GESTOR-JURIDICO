import { generateText, generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { ModelMessage } from 'ai';

import { AdvogadoAssistantService } from '../assistant-financeiro.service.js';
import { detectGreeting } from '../utils/greeting.util.js';

import type { Intent, WorkflowStep, TipoCaso, ConversationContext } from './types.js';
import {
  DOCUMENTOS_BASE,
  CHECKLISTS,
  LINKS_ASSINATURA,
  PROXIMA_ETAPA_POR_FLUXO,
  KEYWORDS_AJUDA,
  KEYWORDS_PROCESSO,
  KEYWORDS_ASSINATURA,
} from './constants.js';
import { chatTools } from './tools.js';
import {
  getSaudacaoAtual,
  assertConversation,
  cleanAIResponse,
  classificarTipoCasoPorFatos,
  gerarMensagemDocsExtras,
} from './utils.js';
import { PromptBuilder } from './prompt-builder.js';
import { ToolOrchestrator } from './tool-orchestrator.js';
import { NotificationService } from './notification.service.js';
import { ReturnFlowHandler } from './return-flow.handler.js';
import { prisma } from '@/lib/prisma.js';

export class ChatbotService {
  private promptBuilder = new PromptBuilder();
  private toolOrchestrator = new ToolOrchestrator();
  private notificationService = new NotificationService();
  private returnFlowHandler = new ReturnFlowHandler();

  // 👇 NOVA FUNÇÃO AUXILIAR: Verifica se o número pertence a um advogado ativo
// 👇 NOVA FUNÇÃO AUXILIAR: Busca 100% à prova de falhas (Ignora máscara, 55 e o dígito 9)
  private async buscarAdvogado(customerPhone: string) {
    // Pega o número que chegou do WhatsApp e limpa tudo que não for número
    const numRecebido = customerPhone.replace(/\D/g, '');
    
    // Pega só os 8 últimos dígitos (81482521) ignorando o '9'
    const final8Recebido = numRecebido.slice(-8); 
    
    // Pega o DDD (71)
    const dddRecebido = numRecebido.length > 10 ? numRecebido.slice(-10, -8) : numRecebido.substring(0, 2);

    // Como o escritório tem poucos advogados, trazemos todos e validamos com precisão absoluta
    const advogados = await prisma.user.findMany({ where: { ativo: true } });

    for (const adv of advogados) {
      if (!adv.telefone) continue;
      
      // Limpa qualquer máscara que possa estar no banco de dados, como (71) ou traços
      const telBanco = adv.telefone.replace(/\D/g, ''); 
      const final8Banco = telBanco.slice(-8);
      const dddBanco = telBanco.length >= 10 ? telBanco.slice(-10, -8) : '';

      // Se o DDD e os 8 últimos números baterem, é o advogado!
      if (final8Recebido === final8Banco && dddRecebido === dddBanco) {
        return adv;
      }
    }
    
    return null;
  }

  async chat(message: string, customerPhone: string): Promise<string | null> {
    let conversation : any = await prisma.conversation.findUnique({ where: { customerPhone } });
    assertConversation(conversation);

    const texto = message.trim();
    const agora = new Date();

    // =========================================================
    // 🚨 INTERCEPTAÇÃO: ADVOGADO DA EQUIPE (FUNCIONÁRIA IA) 🚨
    // =========================================================
    const advogado = await this.buscarAdvogado(customerPhone);
    
    if (advogado) {
      // Se for um advogado, NADA do fluxo de clientes é executado.
      // A mensagem vai direto para a IA Secretária.
      const assistente = new AdvogadoAssistantService();
      return assistente.processarComando(texto, advogado.id);
    }
    // =========================================================


    // --- Interceptores globais de Cliente ---

    if (await this.detectPedidoAjuda(texto) && conversation.workflowStep !== 'COLETA_FATOS') {
      await this.notificationService.notificarAdvogado('AJUDA', conversation);
      return 'Entendi que você precisa de ajuda. Já notifiquei um de nossos advogados, que irá te contatar o mais breve possível para te auxiliar, ok? Enquanto isso, se quiser, pode continuar me enviando informações ou documentos sobre o seu caso.';
    }

    if (texto.toLowerCase() === '/deletar') {
      await prisma.conversationDocument.deleteMany({ where: { conversationId: conversation.id } });
      await prisma.conversation.delete({ where: { customerPhone } });
      return '♻️ *Histórico resetado!* Seus dados e documentos foram apagados. Você já pode enviar um \'Oi\' para iniciar um novo teste.';
    }

    if (texto.includes('BTN_FINALIZAR_PROVAS') || texto.toUpperCase().includes('FINALIZAR')) {
      if (conversation.workflowStep === 'COLETA_DOCS_EXTRA') {
        let tipoCaso = (conversation.tipoCaso as TipoCaso) ?? 'GERAL';
        
        await prisma.conversation.update({ 
          where: { customerPhone }, 
          data: { workflowStep: 'ASSINATURA', fallbackStage: 0 } 
        });

        if (tipoCaso === 'GERAL') {
          await this.notificationService.notificarAdvogado('CASO_ESPECIFICO', conversation);
          return `Perfeito! Recebemos todas as provas. ✅\n\nNossa equipe jurídica já foi notificada para fazer uma análise inicial e vai gerar um *contrato e procuração totalmente personalizados* para você.\n\nEm breve, um de nossos advogados vai te chamar por aqui com os documentos para assinatura!`;
        }

        const links = LINKS_ASSINATURA[tipoCaso] || LINKS_ASSINATURA['GERAL'];
        return `Perfeito! Recebemos todas as provas. ✅\n\nAgora só precisamos da sua assinatura digital para iniciar a análise do seu caso.\n\n📄 *Contrato:*\n${links.contrato}\n\n🖊️ *Procuração:*\n${links.procuracao}\n\nLeva menos de 2 minutos 😉\n\nAssim que finalizar, clique no botão abaixo para me avisar.`;
      }
    }

    // NOVO INTERCEPTADOR: Clique no botão de Assinatura Concluída
    if (texto.includes('BTN_ASSINATURA_OK') || this.detectAssinaturaConcluida(texto)) {
      if (conversation.workflowStep === 'ASSINATURA') {
        await prisma.conversation.update({ 
          where: { customerPhone }, 
          data: { workflowStep: 'FINALIZADO' } 
        });
        await this.notificationService.notificarAdvogado('ASSINOU', conversation);
        return `Perfeito! Recebi sua confirmação 🙌\n\nNossa equipe jurídica já foi notificada e dará continuidade na análise do seu caso.\n\nEm breve você receberá atualizações.`;
      }
    }

    if (conversation.returnFlow) {
      return this.returnFlowHandler.handle(texto, conversation);
    }

   if (await this.detectarConsultaProcesso(texto) && conversation.workflowStep !== 'FINALIZADO') {
      await prisma.conversation.update({
        where: { customerPhone },
        data: { returnFlow: 'AGUARDANDO_CPF' }, // Mantemos o nome da tag interna igual para não quebrar o fluxo
      });
      return `Olá! 🏢 Para localizar o andamento dos seus processos, por favor, me informe o seu *CPF* (apenas números) ou o seu *Nome Completo*.`;
    }

    if (conversation.workflowStep === 'FINALIZADO') {
      return this.returnFlowHandler.handle(texto, conversation);
    }

    // --- Estado atual ---
    let estadoAtual = conversation.workflowStep as WorkflowStep;
    let tipoCaso = (conversation.tipoCaso as TipoCaso) ?? 'GERAL';
    const jaApresentado = !!conversation.presentedAt;
    const { isGreeting, isPureGreeting } = detectGreeting(texto);

    // --- Checklists ---
    const documentosRecebidos = await prisma.conversationDocument.findMany({
      where: { conversationId: conversation.id, etapa: 'ESSENCIAL', validado: true },
      select: { tipo: true },
    });
    const documentosRecebidosCodigos = documentosRecebidos.map(d => d.tipo.toUpperCase());

    const documentosBasePendentes = DOCUMENTOS_BASE.filter(
      doc => !documentosRecebidosCodigos.includes(doc.codigo),
    );
    const documentosCasoPendentes = (CHECKLISTS[tipoCaso] ?? []).filter(
      doc => !documentosRecebidosCodigos.includes(doc.codigo),
    );
    const documentosPendentesAtuais =
      documentosBasePendentes.length > 0 ? documentosBasePendentes : documentosCasoPendentes;

    const buildContext = (): ConversationContext => ({
      estadoAtual,
      tipoCaso,
      documentosFaltantes: documentosPendentesAtuais.map(d => d.descricao),
      documentosEsperadosAgora: documentosPendentesAtuais.map(d => d.descricao),
      presentedAt: conversation!.presentedAt,
      saudacaoTempo: getSaudacaoAtual(),
      tempData: conversation!.tempData,
    });

    // --- Saudação ---
    if (isGreeting && isPureGreeting) {
      if (!jaApresentado) {
        await prisma.conversation.update({ where: { customerPhone }, data: { presentedAt: agora } });
        await this.notificationService.notificarAdvogado('PRIMEIRO_CONTATO', conversation);
        return this.responder({ intent: 'APRESENTACAO_INICIAL', conversation: buildContext(), contexto: { saudacaoTempo: getSaudacaoAtual() } });
      }
      return this.responder({ intent: 'SAUDACAO_RETORNO', contexto: { nome: conversation.customerName }, conversation: buildContext() });
    }

    // --- Curto-circuito para documentos recebidos em COLETA_DOCS ---
    if (documentosRecebidos.length > 0 && estadoAtual === 'COLETA_DOCS') {
      if (documentosRecebidos.length === 2) {
        await prisma.conversation.update({
          where: { customerPhone },
          data: { workflowStep: 'COLETA_DOCS_EXTRA' },
        });
        estadoAtual = 'COLETA_DOCS_EXTRA';

        conversation = await prisma.conversation.findUnique({ where: { customerPhone } }) as NonNullable<typeof conversation>;

        if (!conversation.tipoCaso) {
          const fatos = conversation.tempData as any;
          if (fatos?.dinamica_do_dano && fatos?.empresa && fatos?.data_do_ocorrido && fatos?.prejuizo) {
            const tipoInferido = await classificarTipoCasoPorFatos(fatos);
            await prisma.conversation.update({ where: { customerPhone }, data: tipoInferido });
            conversation = await prisma.conversation.findUnique({ where: { customerPhone } }) as NonNullable<typeof conversation>;
            tipoCaso = tipoInferido.tipoCaso;
          }
        }

        return gerarMensagemDocsExtras(tipoCaso);
      }

      return `Documento recebido!\nAgora preciso de: *${documentosPendentesAtuais.map(d => d.descricao).join(', ')}*.`;
    }

    // --- COLETA_DOCS_EXTRA ---
    if (estadoAtual === 'COLETA_DOCS_EXTRA') {
      return this.handleDocsExtra(texto, tipoCaso, documentosRecebidos, customerPhone, conversation);
    }

    // --- Assinatura confirmada ---
    if (estadoAtual === 'ASSINATURA' && this.detectAssinaturaConcluida(texto)) {
      await this.notificationService.notificarAdvogado('ASSINOU', conversation);
      return `Perfeito! Recebi sua confirmação 🙌\n\nNossa equipe jurídica já foi notificada e dará continuidade na análise do seu caso.\n\nEm breve você receberá atualizações.`;
    }

    // --- Histórico para IA ---
    const historico = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 12,
    });

    const messages: ModelMessage[] = historico
      .filter(m => m.type === 'text' && typeof m.content === 'string')
      .map(m => ({ role: m.role === 'USER' ? 'user' : 'assistant', content: m.content! }));

    // --- Chamada à IA ---
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: this.promptBuilder.build(buildContext()),
      messages,
      tools: chatTools,
      toolChoice: 'auto',
    });

    const toolCalls = result.toolCalls?.filter(tc =>
      ['registrarFatos', 'atualizarEtapa', 'definirTipoCaso'].includes(tc.toolName),
    ) ?? [];

    let textoResposta = cleanAIResponse(result.text ?? '');
    console.log('[DEBUG] IA FALA:', textoResposta);

    // --- Processa tool calls ---
    if (toolCalls.length > 0) {
      const orchestratorResult = await this.toolOrchestrator.process(
        toolCalls,
        conversation,
        buildContext,
        (input) => this.responder(input),
        customerPhone,
      );

      if (orchestratorResult.tipoCaso) tipoCaso = orchestratorResult.tipoCaso;
      if (orchestratorResult.estadoAtual) estadoAtual = orchestratorResult.estadoAtual;
      if (orchestratorResult.response !== null) return orchestratorResult.response;
    }

    // --- Auto-avanço se fatos completos mas nenhuma tool foi chamada ---
    const fatos = conversation.tempData as any;
    const coletaFatosCompleta =
      estadoAtual === 'COLETA_FATOS' &&
      fatos?.dinamica_do_dano &&
      fatos?.empresa &&
      fatos?.data_do_ocorrido &&
      fatos?.prejuizo;

    if (coletaFatosCompleta && toolCalls.length === 0) {
      const proximaEtapa = PROXIMA_ETAPA_POR_FLUXO[estadoAtual];
      if (proximaEtapa) {
        await prisma.conversation.update({ where: { customerPhone }, data: { workflowStep: proximaEtapa } });
        return this.responder({ intent: 'TRANSICAO_ETAPA', conversation: { ...buildContext(), estadoAtual: proximaEtapa } });
      }
    }

    if (!textoResposta) {
      return this.responder({ intent: 'AGUARDAR_RESPOSTA', conversation: buildContext() });
    }

    return textoResposta;
  }

  // --- Handlers auxiliares privados ---

  private async handleDocsExtra(
    texto: string,
    tipoCaso: TipoCaso,
    documentosRecebidos: any[],
    customerPhone: string,
    conversation: any,
  ): Promise<string> {
    if (texto.toUpperCase().includes('FINALIZAR')) {
      if (tipoCaso === 'GERAL') {
        await prisma.conversation.update({ where: { customerPhone }, data: { workflowStep: 'ASSINATURA', fallbackStage: 0 } });
        await this.notificationService.notificarAdvogado('CASO_ESPECIFICO', conversation);
        return `Perfeito! Recebemos todas as provas.\n\nNossa equipe jurídica já foi notificada para fazer uma análise inicial e vai gerar um *contrato e procuração totalmente personalizados* para você.\n\nEm breve, um de nossos advogados vai te chamar por aqui com os documentos para assinatura!`;
      }

      await prisma.conversation.update({ where: { customerPhone }, data: { workflowStep: 'ASSINATURA', fallbackStage: 0 } });

      const links = LINKS_ASSINATURA[tipoCaso] || LINKS_ASSINATURA['GERAL'];
      return `Perfeito! Recebemos todas as provas.\n\nAgora só precisamos da sua assinatura digital para iniciar a análise do seu caso.\n\n📄 Contrato:\n${links.contrato}\n\n🖊️ Procuração:\n${links.procuracao}\n\nLeva menos de 2 minutos 😉\n\nAssim que finalizar, me avise por aqui.`;
    }

    if (documentosRecebidos.length > 0) {
      return 'Arquivo recebido! Pode enviar mais ou digitar *FINALIZAR* quando terminar.';
    }

    return 'Fico no aguardo. Pode enviar mais provas ou digitar *FINALIZAR*.';
  }

  private async responder(input: {
    intent: Intent;
    contexto?: Record<string, any>;
    conversation: ConversationContext;
  }): Promise<string> {
    const system = this.promptBuilder.build({
      estadoAtual: input.conversation.estadoAtual,
      tipoCaso: input.conversation.tipoCaso,
      documentosFaltantes: input.conversation.documentosFaltantes,
      documentosEsperadosAgora: input.conversation.documentosEsperadosAgora ?? [],
      presentedAt: input.conversation.presentedAt,
      fatos: input.conversation.tempData,
    });

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      temperature: 0.3,
      system,
      prompt: JSON.stringify({ intent: input.intent, contexto: input.contexto ?? {} }),
    });

    return cleanAIResponse(text ?? '');
  }

  // --- Detectors ---

  private async detectPedidoAjuda(texto: string): Promise<boolean> {
    // Pré-filtro: se nenhuma keyword sequer aparece, retorna false sem chamar a IA
    const t = texto.toLowerCase();
    const temKeyword = KEYWORDS_AJUDA.some(p => t.includes(p));
    if (!temKeyword) return false;

    // Keyword presente → IA decide se é pedido real de ajuda humana ou menção casual
    try {
      const { object } = await generateObject({
        model: openai('gpt-4o-mini'),
        temperature: 0,
        schema: z.object({
          pedidoDeAjudaHumana: z.boolean().describe(
            'true somente se o cliente está explicitamente pedindo para falar com um advogado/humano ou declarando que não consegue prosseguir. false se a palavra aparece em contexto diferente (ex: "problema no meu processo", "dúvida sobre a audiência").'
          ),
        }),
        system: 'Você classifica intenções de clientes num chatbot jurídico. Seja conservador: só retorne true se a intenção de falar com um humano for inequívoca.',
        prompt: `Mensagem do cliente: "${texto}"`,
      });
      return object.pedidoDeAjudaHumana;
    } catch {
      // Em caso de falha na IA, comportamento conservador: não interrompe o fluxo
      return false;
    }
  }

  private detectAssinaturaConcluida(texto: string): boolean {
    const t = texto.toLowerCase();
    return KEYWORDS_ASSINATURA.some(p => t.includes(p));
  }

  private async detectarConsultaProcesso(texto: string): Promise<boolean> {
    // Pré-filtro: se nenhuma keyword sequer aparece, retorna false sem chamar a IA
    const t = texto.toLowerCase();
    const temKeyword = KEYWORDS_PROCESSO.some(p => t.includes(p));
    if (!temKeyword) return false;

    // Keyword presente → IA decide se é um pedido real de consulta de andamento
    try {
      const { object } = await generateObject({
        model: openai('gpt-4o-mini'),
        temperature: 0,
        schema: z.object({
          consultaDeProcesso: z.boolean().describe(
            'true somente se o cliente está ativamente solicitando informações, status, novidades ou andamento de um processo judicial existente. false se a palavra for usada num contexto de relato (ex: "vou entrar com um processo", "ele me processou", "quero processar a empresa").'
          ),
        }),
        system: 'Você classifica intenções de clientes num chatbot jurídico. Seja preciso: só retorne true se a intenção principal for buscar atualizações/status de um processo que já existe.',
        prompt: `Mensagem do cliente: "${texto}"`,
      });
      return object.consultaDeProcesso;
    } catch (error) {
      // Em caso de falha na IA, comportamento conservador: assume que não é consulta de processo
      return false;
    }
  }

  // Mantido público para compatibilidade com chamadas externas existentes
  async notificarAdvogado(tipo: 'ASSINOU' | 'AJUDA' | 'PRIMEIRO_CONTATO' | 'CASO_ESPECIFICO', conversation: any) {
    return this.notificationService.notificarAdvogado(tipo, conversation);
  }
}