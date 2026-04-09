
import { registrarFatosSchema } from './tools.js';
import { PROXIMA_ETAPA_POR_FLUXO } from './constants.js';
import { classificarTipoCasoPorFatos } from './utils.js';
import type { WorkflowStep, TipoCaso, ConversationContext } from './types.js';
import { prisma } from '@/lib/prisma.js';

export type ToolOrchestratorResult = {
  /** Resposta pronta para retornar ao cliente, ou null para continuar o fluxo normal */
  response: string | null;
  tipoCaso?: TipoCaso;
  estadoAtual?: WorkflowStep;
};

export class ToolOrchestrator {
  async process(
    toolCalls: any[],
    conversation: any,
    buildContext: () => ConversationContext,
    responder: (input: any) => Promise<string>,
    customerPhone: string,
  ): Promise<ToolOrchestratorResult> {
    const callTipoCaso = toolCalls.find(t => t.toolName === 'definirTipoCaso');
    let tipoCaso = conversation.tipoCaso as TipoCaso;

    if (callTipoCaso) {
      const rawArgs = (callTipoCaso as any).args ?? {};
      const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

      await prisma.conversation.update({
        where: { customerPhone },
        data: { tipoCaso: args.tipoCaso },
      });

      tipoCaso = args.tipoCaso;
    }

    const callRegistrar = toolCalls.find(t => t.toolName === 'registrarFatos');
    const callAtualizar = toolCalls.find(t => t.toolName === 'atualizarEtapa');

    // --- registrarFatos ---
    if (callRegistrar) {
      if (conversation.workflowStep !== 'COLETA_FATOS') {
        console.log('[DEBUG] Ignorando registrarFatos fora da etapa correta');
        return { response: null, tipoCaso };
      }

      const rawArgs = (callRegistrar as any).args ?? (callRegistrar as any).input ?? {};
      const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

      console.log('[DEBUG] Salvando Fatos:', args);

      const parsed = registrarFatosSchema.safeParse(args);

      if (!parsed.success) {
        console.warn('[IA tentou registrar fatos incompletos]', parsed.error);
        const ctx = buildContext();
        const response = await responder({
          intent: 'AGUARDAR_RESPOSTA',
          conversation: ctx,
          contexto: {
            instrucaoExtra:
              'Você tentou registrar fatos incompletos. Faça a pergunta ao cliente sobre a informação que está faltando (Data, Empresa, etc) em UMA frase curta e sem formatar em lista.',
          },
        });
        return { response, tipoCaso };
      }

      const currentTempData = (conversation.tempData ?? {}) as any;

      await prisma.conversation.update({
        where: { customerPhone },
        data: {
          tempData: {
            ...currentTempData,
            dinamica_do_dano: args.dinamica_do_dano ?? currentTempData.dinamica_do_dano,
            empresa: args.empresa ?? currentTempData.empresa,
            data_do_ocorrido: args.data_do_ocorrido ?? currentTempData.data_do_ocorrido,
            prejuizo: args.prejuizo ?? currentTempData.prejuizo,
          },
        },
      });

      const updatedConversation = await prisma.conversation.findUnique({ where: { customerPhone } });
      const fatos = updatedConversation?.tempData as any;

      const fatosCompletos =
        !!fatos?.dinamica_do_dano &&
        !!fatos?.empresa &&
        !!fatos?.data_do_ocorrido &&
        !!fatos?.prejuizo;

      if (fatosCompletos) {
        await prisma.conversation.update({
          where: { customerPhone },
          data: {
            workflowStep: 'COLETA_DOCS',
            tempData: { ...(fatos ?? {}), aguardandoDocumentos: true },
          },
        });

        const ctx = buildContext();
        const response = await responder({
          intent: 'TRANSICAO_ETAPA',
          conversation: { ...ctx, estadoAtual: 'COLETA_DOCS', tempData: fatos },
        });
        return { response, tipoCaso, estadoAtual: 'COLETA_DOCS' };
      }

      return { response: null, tipoCaso };
    }

    // --- atualizarEtapa ---
    if (callAtualizar) {
      console.log('[DEBUG] Atualizando Etapa via Tool');

      const fatosParaValidar = conversation.tempData as any;
      const fatosEstaoCompletos =
        fatosParaValidar?.dinamica_do_dano &&
        fatosParaValidar?.empresa &&
        fatosParaValidar?.data_do_ocorrido &&
        fatosParaValidar?.prejuizo;

      if (conversation.workflowStep === 'COLETA_FATOS' && !fatosEstaoCompletos) {
        console.log('[DEBUG] IA tentou avançar sem os 4 fatos preenchidos. Bloqueado pelo sistema.');
        const ctx = buildContext();
        const response = await responder({
          intent: 'AGUARDAR_RESPOSTA',
          conversation: ctx,
          contexto: {
            instrucaoExtra:
              'Você tentou avançar de etapa, mas ainda faltam dados obrigatórios. Faça a pergunta sobre o que está faltando.',
          },
        });
        return { response, tipoCaso };
      }

      const estadoAtual = conversation.workflowStep as WorkflowStep;
      const proximaEtapa = PROXIMA_ETAPA_POR_FLUXO[estadoAtual];

      if (proximaEtapa) {
        await prisma.conversation.update({
          where: { customerPhone },
          data: { workflowStep: proximaEtapa },
        });

        const ctx = buildContext();
        const response = await responder({
          intent: 'TRANSICAO_ETAPA',
          conversation: { ...ctx, estadoAtual: proximaEtapa },
        });
        return { response, tipoCaso, estadoAtual: proximaEtapa };
      }
    }

    return { response: null, tipoCaso };
  }
}
