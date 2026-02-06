import { generateText } from 'ai';
import { groq } from '@ai-sdk/groq';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import type { FinanceiroService } from '@/modules/financeiro/financeiro.service.js';
import { ZapSignService } from './zapsign-service.js';
import { ConversationPolicy } from './policy/conversation-policy.js';
import { DocumentExceptionPolicy } from './policy/document-exception-policy.js';
import { detectGreeting } from './policy/greeting.util.js';
import type { ModelMessage } from 'ai';
/* ---------------------------------
   TIPOS & CONSTANTES
--------------------------------- */

type Intent =
  | 'SAUDACAO_RETORNO'
  | 'APRESENTACAO_INICIAL'
  | 'ABRIR_RELATO'
  | 'PEDIR_NOME'
  | 'PEDIR_RELATO'
  | 'AVISO_DADO_SENSIVEL'
  | 'AGUARDAR_RESPOSTA'
  | 'FALLBACK_ETAPA'
  | 'TRANSICAO_ETAPA'
  | 'AGUARDAR_DOCUMENTOS'
  | 'ASSINATURA_PREPARO';

type WorkflowStep =
  | 'TRIAGEM'
  | 'COLETA_FATOS'
  | 'COLETA_DOCS'
  | 'ASSINATURA'
  | 'FINALIZADO';

type TipoCaso = 'VOO' | 'BANCO' | 'SAUDE' | 'GERAL' | 'BPC' | 'INSS' | 'GOV';

const tipoCasoEnum = z.enum([
  'VOO',
  'BANCO',
  'SAUDE',
  'GERAL',
  'BPC',
  'INSS',
  'GOV',
]);

type DocumentoChecklist = {
  codigo: string;
  descricao: string;
  sensivel?: boolean;
};

const TRANSICOES_VALIDAS: Record<WorkflowStep, WorkflowStep[]> = {
  TRIAGEM: ['COLETA_FATOS'],
  COLETA_FATOS: ['COLETA_DOCS'],
  COLETA_DOCS: ['ASSINATURA'],
  ASSINATURA: ['FINALIZADO'],
  FINALIZADO: [],
};

/* ---------------------------------
   SCHEMAS
--------------------------------- */

const atualizarEtapaSchema = z.object({
  motivo: z.string().min(3),
  tipo_caso: tipoCasoEnum.optional(),
});

const PROXIMA_ETAPA_POR_FLUXO: Record<WorkflowStep, WorkflowStep | null> = {
  TRIAGEM: 'COLETA_FATOS',
  COLETA_FATOS: 'COLETA_DOCS',
  COLETA_DOCS: 'ASSINATURA',
  ASSINATURA: 'FINALIZADO',
  FINALIZADO: null,
};

// const atualizarEtapaSchema = z.object({
//   novaEtapa: z.enum([
//     'TRIAGEM',
//     'COLETA_FATOS',
//     'COLETA_DOCS',
//     'ASSINATURA',
//     'FINALIZADO',
//   ]),
//   tipo_caso: z.string().optional(),
//   motivo: z.string().optional(),
// });

// const definirNomeSchema = z.object({
//   nome: z.string(),
// });

/* ---------------------------------
   CHECKLISTS
--------------------------------- */

const CHECKLISTS: Record<TipoCaso, DocumentoChecklist[]> = {
  VOO: [
    { codigo: 'PASSAGEM', descricao: 'Passagens aéreas' },
    { codigo: 'ATRASO', descricao: 'Comprovante do atraso/cancelamento' },
    { codigo: 'GASTOS', descricao: 'Gastos extras' },
  ],
  BANCO: [
    { codigo: 'EXTRATO', descricao: 'Extratos bancários' },
    { codigo: 'BLOQUEIO', descricao: 'Print do bloqueio' },
  ],
  SAUDE: [
    { codigo: 'CARTEIRINHA', descricao: 'Carteirinha do plano' },
    { codigo: 'LAUDO', descricao: 'Laudo médico', sensivel: true },
    { codigo: 'NEGATIVA', descricao: 'Negativa do plano' },
  ],
  GERAL: [
    { codigo: 'RG', descricao: 'RG ou CNH' },
    { codigo: 'COMP_RES', descricao: 'Comprovante de residência' },
  ],
  BPC: [
    { codigo: 'RG', descricao: 'RG ou CNH' },
    { codigo: 'CPF', descricao: 'CPF' },
    { codigo: 'CADUNICO', descricao: 'Folha do CadÚnico' },
    { codigo: 'LAUDO', descricao: 'Laudo médico', sensivel: true },
  ],
  INSS: [{ codigo: 'RG', descricao: 'RG ou CNH' }],
  GOV: [
    { codigo: 'RG', descricao: 'RG ou CNH' },
    { codigo: 'GOVBR', descricao: 'Print da conta GOV.BR' },
  ],
};

/* ---------------------------------
   SERVICE
--------------------------------- */

export class ChatbotService {
  private zapSignService = new ZapSignService();

  constructor() { }

  async chat(message: string, customerPhone: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { customerPhone },
    });

    if (!conversation) throw new Error('Conversa não encontrada');

    const texto = message.trim();
    const agora = new Date();

    let estadoAtual = conversation.workflowStep as WorkflowStep;
    let tipoCaso = (conversation.tipoCaso as TipoCaso) ?? 'GERAL';
    const jaApresentado = !!conversation.presentedAt;

    const { isGreeting, isPureGreeting } = detectGreeting(texto);

    /* -----------------------------
       DOCUMENTOS (PRECISA VIR ANTES)
    ----------------------------- */
    const mensagensDocumento = await prisma.message.findMany({
      where: { conversationId: conversation.id, type: 'document' },
      select: { fileName: true },
    });

    const documentosRecebidos = mensagensDocumento
      .map((d) => d.fileName?.split('.')[0]?.toUpperCase())
      .filter(Boolean) as string[];

    const checklist = CHECKLISTS[tipoCaso] ?? CHECKLISTS.GERAL;

    const documentosFaltantes = checklist.filter(
      (doc) => !documentosRecebidos.includes(doc.codigo),
    );

    /* -----------------------------
       CONTEXTO ÚNICO (🔧 AJUSTE)
    ----------------------------- */
    const contextConversation = {
      estadoAtual,
      tipoCaso,
      documentosFaltantes: documentosFaltantes.map(d => d.descricao),
      presentedAt: conversation.presentedAt,
    };

    /* -----------------------------
       SAUDAÇÃO (BLINDADA)
    ----------------------------- */
    if (isGreeting && isPureGreeting) {
      if (!jaApresentado) {
        await prisma.conversation.update({
          where: { customerPhone },
          data: { presentedAt: agora },
        });

        return this.responder({
          intent: 'APRESENTACAO_INICIAL',
          conversation: {
            ...contextConversation,
            presentedAt: agora, // 🔧 AJUSTE CRÍTICO
          },
        });
      }

      if (estadoAtual === 'TRIAGEM') {
        await prisma.conversation.update({
          where: { customerPhone },
          data: { workflowStep: 'COLETA_FATOS' },
        });

        estadoAtual = 'COLETA_FATOS';

        return this.responder({
          intent: 'ABRIR_RELATO',
          conversation: {
            ...contextConversation,
            estadoAtual,
          },
        });
      }

      return this.responder({
        intent: 'SAUDACAO_RETORNO',
        contexto: { nome: conversation.customerName },
        conversation: contextConversation, // 🔧
      });
    }

    /* -----------------------------
       COLETA DE NOME
    ----------------------------- */
    if (!conversation.customerName) {
      const match = texto.match(/(me chamo|meu nome é|sou)\s+(.+)/i);

      if (!match?.[2]) {
        return this.responder({
          intent: 'PEDIR_NOME',
          conversation: contextConversation, // 🔧
        });
      }

      const nome = match[2].trim();

      await prisma.conversation.update({
        where: { customerPhone },
        data: {
          customerName: nome,
          workflowStep: 'COLETA_FATOS',
        },
      });

      estadoAtual = 'COLETA_FATOS';

      return this.responder({
        intent: 'PEDIR_RELATO',
        conversation: {
          ...contextConversation,
          estadoAtual,
        },
      });
    }

    /* -----------------------------
       LGPD – DADOS SENSÍVEIS
    ----------------------------- */
    if (/(cancer|câncer|autismo|psiqui|doen[cç]a|tratamento|cid[-\s]?\d*)/i.test(texto)) {
      return this.responder({
        intent: 'AVISO_DADO_SENSIVEL',
        conversation: contextConversation, // 🔧
      });
    }

    /* -----------------------------
       CONFIRMAÇÕES SIMPLES
    ----------------------------- */
    if (/^(tudo (sim|bem)|to bem|estou bem)$/i.test(texto)) {
      return this.responder({
        intent: 'ABRIR_RELATO',
        conversation: contextConversation, // 🔧
      });
    }

    /* -----------------------------
       DETECÇÃO DE RELATO
    ----------------------------- */
    const pareceRelato =
      /(problema|atraso|cancelamento|voo|a[eé]reo|banco|plano|negou)/i.test(texto);

    if (pareceRelato && estadoAtual === 'TRIAGEM') {
      tipoCaso = texto.match(/voo|a[eé]reo/i) ? 'VOO' : tipoCaso;

      await prisma.conversation.update({
        where: { customerPhone },
        data: {
          workflowStep: 'COLETA_FATOS',
          tipoCaso,
        },
      });

      estadoAtual = 'COLETA_FATOS';

      return this.responder({
        intent: 'ABRIR_RELATO',
        conversation: {
          ...contextConversation,
          estadoAtual,
          tipoCaso,
        },
      });
    }

    /* -----------------------------
       HISTÓRICO REAL
    ----------------------------- */
    const historico = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 12,
    });

    const messages: ModelMessage[] = historico
      .filter((m) => typeof m.content === 'string')
      .map((m) => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content!,
      }));

    /* -----------------------------
       IA COM MEMÓRIA
    ----------------------------- */
    const result = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      system: this.buildSystemPrompt(contextConversation),
      messages: [
        ...messages,
        { role: 'user', content: texto },
      ],
      tools: {
        atualizarEtapa: { parameters: atualizarEtapaSchema },
        gerarLinkAssinatura: { parameters: z.object({}) },
      } as any,
    });

    /* -----------------------------
       TOOLS
    ----------------------------- */
    if (result.toolCalls?.length) {
      for (const call of result.toolCalls) {
        const args = (call as any).args ?? {};

        if (call.toolName === 'atualizarEtapa') {
          const input = atualizarEtapaSchema.parse(args);

          const proximaEtapa = PROXIMA_ETAPA_POR_FLUXO[estadoAtual];

          if (!proximaEtapa) {
            throw new Error(`Nenhuma transição definida para ${estadoAtual}`);
          }

          await prisma.conversation.update({
            where: { customerPhone },
            data: {
              workflowStep: proximaEtapa,
              ...(input.tipo_caso && { tipoCaso: input.tipo_caso }),
            },
          });

          return this.responder({
            intent: 'TRANSICAO_ETAPA',
            contexto: {
              etapa: proximaEtapa,
              motivo: input.motivo,
            },
            conversation: {
              estadoAtual: proximaEtapa,
              tipoCaso: input.tipo_caso ?? tipoCaso,
              documentosFaltantes: documentosFaltantes.map(d => d.descricao),
              presentedAt: conversation.presentedAt,
            },
          });
        }

        if (call.toolName === 'gerarLinkAssinatura') {
          return this.responder({
            intent: 'ASSINATURA_PREPARO',
            conversation: {
              estadoAtual,
              tipoCaso,
              documentosFaltantes: documentosFaltantes.map(d => d.descricao),
              presentedAt: conversation.presentedAt,
            },
          });
        }
      }
    }

    return result.text;
  }






  /* ---------------------------------
     PROMPT
  --------------------------------- */

  private buildSystemPrompt(context: {
    estadoAtual: WorkflowStep;
    tipoCaso: TipoCaso;
    documentosFaltantes: string[];
    presentedAt: Date | null;
  }) {
    return `
VOCÊ É Carol, advogada do escritório RCS Advocacia.

CONTEXTO CRÍTICO:
- Apresentação já realizada: ${context.presentedAt ? 'SIM' : 'NÃO'}

REGRAS ABSOLUTAS DE APRESENTAÇÃO:
- A apresentação ("Me chamo Carol...", "sou advogada...") só pode ocorrer UMA ÚNICA VEZ em toda a conversa.
- Se "Apresentação já realizada" for SIM, é PROIBIDO repetir qualquer forma de apresentação.
- Se o cliente já iniciou ou descreveu um problema, é PROIBIDO perguntar "como posso ajudar".
- Se a conversa já possui histórico, NÃO se comporte como primeira interação.

MEMÓRIA:
- Você recebe TODO o histórico da conversa.
- NÃO repita informações, perguntas ou saudações já feitas.
- Continue a conversa exatamente de onde ela parou.

APRESENTACAO_INICIAL (somente se Apresentação já realizada = NÃO):
- Cumprimente de acordo com o horário.
- Diga: "Me chamo Carol, sou advogada do escritório RCS Advocacia".
- Pergunte se está tudo bem.
- Pergunte como pode ajudar.
- Máximo de 2 frases.
- NÃO peça nome.
- NÃO peça relato detalhado.
- NÃO peça documentos.

RITMO DE CONVERSA (OBRIGATÓRIO):
- Nunca solicite documentos logo após uma saudação.
- Nunca combine acolhimento emocional + pedido de documento.
- Antes de qualquer solicitação, confirme entendimento.
- Explique brevemente o motivo de qualquer pedido.

COLETA_FATOS:
Esta etapa só é considerada completa quando o cliente informar claramente:
- O que aconteceu
- Quando aconteceu
- Com quem foi o problema

TOM DE VOZ:
- Profissional, humano e direto.
- Frases curtas.
- Sem emojis.
- Sem linguagem publicitária ou institucional.

SUA FUNÇÃO:
- Coletar informações iniciais do cliente.
- Organizar documentos.
- Encaminhar o caso para análise humana.
- NUNCA prestar aconselhamento jurídico.

REGRAS INEGOCIÁVEIS:
1. NUNCA afirme ou sugira direito, ganho de causa ou indenização.
2. NUNCA dê opinião jurídica, previsão de resultado ou valores.
3. Para avançar etapas, VOCÊ DEVE chamar a tool "atualizarEtapa".
4. NÃO avance etapas apenas com texto.
5. Faça no máximo UMA pergunta objetiva por mensagem.
6. Se a etapa atual estiver completa, CHAME a tool adequada.
7. Dados sensíveis (ex: saúde): solicite APENAS documentos, nunca descrições.

VOCÊ NÃO DECIDE:
- Qual etapa vem a seguir.
- Se documentos são suficientes.
- Se o fluxo deve avançar sem tool.

FLUXO ATUAL:
- Etapa: ${context.estadoAtual}
- Tipo de caso: ${context.tipoCaso}

DOCUMENTOS PENDENTES:
${context.documentosFaltantes.length ? context.documentosFaltantes.join(', ') : 'Nenhum'}

COMPORTAMENTO FINAL:
- Linguagem simples.
- Sem termos técnicos.
- Seja clara, educada e objetiva.
- Em caso de dúvida, peça esclarecimento antes de avançar.

FLUIDEZ OBRIGATÓRIA:
- Responda como uma conversa real de WhatsApp.
- Não antecipe perguntas.
- Se o cliente apenas cumprimentar, apenas cumprimente.
- Sempre aguarde resposta antes de avançar.
- Nunca repita saudações já feitas.

`;
  }



  private async responder(input: {
    intent: Intent;
    contexto?: Record<string, any>;
    conversation: {
      estadoAtual: WorkflowStep;
      tipoCaso: TipoCaso;
      documentosFaltantes: string[];
      presentedAt: Date | null;
    };
  }) {
    const system = this.buildSystemPrompt({
      estadoAtual: input.conversation.estadoAtual,
      tipoCaso: input.conversation.tipoCaso,
      documentosFaltantes: input.conversation.documentosFaltantes,
      presentedAt: input.conversation.presentedAt,
    });

    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      system,
      prompt: JSON.stringify({
        intent: input.intent,
        contexto: input.contexto ?? {},
      }),
    });

    return text;
  }


}
