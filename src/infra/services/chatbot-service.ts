import { generateText, tool } from 'ai';
import { groq } from '@ai-sdk/groq';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

import { ZapSignService } from './zapsign-service.js';

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
  | 'COLETA_FATOS'
  | 'COLETA_DOCS'
  | 'COLETA_DOCS_EXTRA'
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


const atualizarEtapaSchema = z
  .object({})
  .catchall(z.any());

const PROXIMA_ETAPA_POR_FLUXO: Record<WorkflowStep, WorkflowStep | null> = {
  COLETA_FATOS: 'COLETA_DOCS',
  COLETA_DOCS: 'COLETA_DOCS_EXTRA',
  COLETA_DOCS_EXTRA: 'ASSINATURA',
  ASSINATURA: 'FINALIZADO',
  FINALIZADO: null,
};

const atualizarEtapaTool = tool<{}, void>({
  description: 'Avança o workflow para a próxima etapa lógica',
  inputSchema: z.object({}),
  execute: async () => {
    // apenas sinaliza a transição
  },
});

const registrarFatosSchema = z.object({
  dinamica_do_dano: z
    .string()
    .min(30, 'Descreva o ocorrido com mais detalhes')
    .describe(
      'Descrição detalhada do que aconteceu, incluindo contexto, duração, transtornos e consequências práticas'
    ),

  empresa: z
    .string()
    .min(2)
    .describe('Nome da empresa responsável pelo ocorrido'),

  data_do_ocorrido: z
    .string()
    .describe('Data ou período aproximado do ocorrido'),

  prejuizo: z
    .string()
    .min(10)
    .describe(
      'Descrição dos prejuízos financeiros, profissionais ou pessoais sofridos'
    ),
});

const definirTipoCasoSchema = z.object({
  tipoCaso: tipoCasoEnum.describe(
    'Classificação principal do caso jurídico com base no relato do cliente'
  ),
});

const definirTipoCasoTool = tool({
  description: 'Define o tipo principal do caso jurídico',
  inputSchema: definirTipoCasoSchema,
  execute: async () => {
    // apenas sinaliza
  },
});


const registrarFatosTool = tool({
  description: 'Registra fatos jurídicos narrados pelo cliente',
  inputSchema: registrarFatosSchema,
  // execute: async (input) => input,
  execute: async () => {
    // apenas sinaliza
  },
});

function getSaudacaoAtual(): string {
  const horas = new Date().getHours();
  if (horas < 12) return 'Bom dia';
  if (horas < 18) return 'Boa tarde';
  return 'Boa noite';
}

function assertConversation(
  conversation: Awaited<ReturnType<typeof prisma.conversation.findUnique>>,
): asserts conversation is NonNullable<typeof conversation> {
  if (!conversation) {
    throw new Error('Conversa não encontrada');
  }
}

async function classificarTipoCasoPorFatos(fatos: {
  dinamica_do_dano?: string;
  empresa?: string;
  data_do_ocorrido?: string;
  prejuizo?: string;
}): Promise<TipoCaso> {
  const { text } = await generateText({
    model: groq('llama-3.3-70b-versatile'),
    temperature: 0.3,
    system: `
Você é um classificador jurídico.
Com base nos fatos fornecidos, classifique o tipo do caso.

RETORNE APENAS UMA DAS OPÇÕES ABAIXO (sem explicações):
- VOO
- BANCO
- SAUDE
- BPC
- INSS
- GOV
- GERAL

REGRAS:
- Atraso, cancelamento, overbooking, bagagem → VOO
- Conta bloqueada, banco, cartão, Pix → BANCO
- Plano de saúde, tratamento, negativa → SAUDE
- Benefício assistencial, deficiência, baixa renda → BPC
- Aposentadoria, auxílio, INSS → INSS
- GOV.BR, serviços públicos digitais → GOV
- Dúvida ou genérico → GERAL
`,
    prompt: `
FATOS:
${JSON.stringify(fatos)}
`,
  });

  const tipo = text?.trim().toUpperCase();

  const permitidos: TipoCaso[] = [
    'VOO', 'BANCO', 'SAUDE', 'BPC', 'INSS', 'GOV', 'GERAL',
  ];

  return permitidos.includes(tipo as TipoCaso)
    ? (tipo as TipoCaso)
    : 'GERAL';
}

function gerarMensagemDocsExtras(tipoCaso: TipoCaso) {
  const checklist = CHECKLISTS[tipoCaso] ?? [];

  if (!checklist.length) {
    return `
Perfeito, agora você pode enviar qualquer outra prova que considere importante.

Pode ser foto, vídeo, áudio, PDF ou print.
Quando terminar, é só digitar *FINALIZAR*.
`.trim();
  }

  const itens = checklist
    .map(doc => `• ${doc.descricao}`)
    .join('\n');

  return `
Perfeito, agora você pode enviar *outras provas* para reforçar seu caso.

Costuma ajudar bastante:
${itens}

Pode enviar fotos, PDFs, áudios ou vídeos.
Quando terminar, é só digitar *FINALIZAR*.
`.trim();
}

/* ---------------------------------
   CHECKLISTS
--------------------------------- */

const DOCUMENTOS_BASE: DocumentoChecklist[] = [
  { codigo: 'RG', descricao: 'RG ou CNH (Frente e Verso ou inteiro)' },
  { codigo: 'COMP_RES', descricao: 'Comprovante de residência' },
];

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


    let conversation = await prisma.conversation.findUnique({
      where: { customerPhone },
    });

    assertConversation(conversation);

    const texto = message.trim();
    const agora = new Date();

    if (texto.toLowerCase() === '/deletar') {
      // 1. Deletamos os documentos vinculados a esta conversa
      await prisma.conversationDocument.deleteMany({
        where: { conversationId: conversation.id }
      });

      // 2. Deletamos a conversa em si
      await prisma.conversation.delete({
        where: { customerPhone }
      });

      return "♻️ *Histórico resetado!* Seus dados e documentos foram apagados. Você já pode enviar um 'Oi' para iniciar um novo teste.";
    }

    let estadoAtual = conversation.workflowStep as WorkflowStep;
    let tipoCaso = (conversation.tipoCaso as TipoCaso) ?? 'GERAL';
    const jaApresentado = !!conversation.presentedAt;

    const { isGreeting, isPureGreeting } = detectGreeting(texto);

    /* -----------------------------
       DOCUMENTOS RECEBIDOS
    ----------------------------- */
    // const mensagensDocumento = await prisma.message.findMany({
    //   where: {
    //     conversationId: conversation.id,
    //     type: 'document',
    //     processed: false,
    //   },
    //   select: { fileName: true },
    // });
    // const documentosRecebidos = mensagensDocumento
    // .map(d => d.fileName?.split('.')[0]?.toUpperCase())
    // .filter(Boolean) as string[];

    const documentosRecebidos = await prisma.conversationDocument.findMany({
      where: {
        conversationId: conversation.id,
        etapa: 'ESSENCIAL',
        validado: true,
      },
      select: {
        tipo: true,
      },
    });
    const documentosRecebidosCodigos = documentosRecebidos.map(
      d => d.tipo.toUpperCase()
    );

    /* -----------------------------
       CHECKLISTS
    ----------------------------- */
    const documentosBasePendentes = DOCUMENTOS_BASE.filter(
      doc => !documentosRecebidosCodigos.includes(doc.codigo),
    );

    const documentosCaso = CHECKLISTS[tipoCaso] ?? [];
    const documentosCasoPendentes = documentosCaso.filter(
      doc => !documentosRecebidosCodigos.includes(doc.codigo),
    );

    const documentosPendentesAtuais =
      documentosBasePendentes.length > 0
        ? documentosBasePendentes
        : documentosCasoPendentes;

    const buildContext = (conv: NonNullable<typeof conversation>) => ({
      estadoAtual,
      tipoCaso,
      documentosFaltantes: documentosPendentesAtuais.map(d => d.descricao),
      documentosEsperadosAgora: documentosPendentesAtuais.map(d => d.descricao),
      presentedAt: conv.presentedAt,
      saudacaoTempo: getSaudacaoAtual(),
    });


    /* -----------------------------
       SAUDAÇÃO
    ----------------------------- */
    if (isGreeting && isPureGreeting) {
      if (!jaApresentado) {
        await prisma.conversation.update({
          where: { customerPhone },
          data: { presentedAt: agora },
        });

        return this.responder({
          intent: 'APRESENTACAO_INICIAL',
          conversation: buildContext(conversation),
          contexto: { saudacaoTempo: getSaudacaoAtual() },
        });
      }

      return this.responder({
        intent: 'SAUDACAO_RETORNO',
        contexto: { nome: conversation.customerName },
        conversation: buildContext(conversation),
      });
    }

    /* -----------------------------
       HISTÓRICO
    ----------------------------- */
    const historico = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 12,
    });

    // 🚨 CURTO-CIRCUITO PARA DOCUMENTOS
    if (documentosRecebidos.length > 0 && estadoAtual === 'COLETA_DOCS') {
      if (documentosPendentesAtuais.length === 0) {
        await prisma.conversation.update({
          where: { customerPhone },
          data: { workflowStep: 'COLETA_DOCS_EXTRA' },
        });
        estadoAtual = 'COLETA_DOCS_EXTRA';
        conversation = await prisma.conversation.findUnique({
          where: { customerPhone },
        }) as NonNullable<typeof conversation>;

        // --- LÓGICA DE TRANSIÇÃO AUTOMÁTICA (AUTO-COMPLETE) ---
        const fatos = conversation.tempData as any;

        const temDinamica = !!fatos?.dinamica_do_dano;
        const temEmpresa = !!fatos?.empresa;
        const temData = !!fatos?.data_do_ocorrido;
        const temPrejuizo = !!fatos?.prejuizo;

        if (!conversation.tipoCaso && temDinamica && temEmpresa && temData && temPrejuizo) {
          const tipoInferido = await classificarTipoCasoPorFatos(fatos);

          await prisma.conversation.update({
            where: { customerPhone },
            data: { tipoCaso: tipoInferido },
          });

          conversation = await prisma.conversation.findUnique({
            where: { customerPhone },
          }) as NonNullable<typeof conversation>;

          tipoCaso = tipoInferido;
        }

        return gerarMensagemDocsExtras(tipoCaso);

      }

      return `Documento recebido!   
Agora preciso de: *${documentosPendentesAtuais.map(d => d.descricao).join(', ')}*.`;
    }

    if (estadoAtual === 'COLETA_DOCS_EXTRA') {

      // Cliente finalizou manualmente
      if (texto.toUpperCase().includes('FINALIZAR')) {
        await prisma.conversation.update({
          where: { customerPhone },
          data: { workflowStep: 'ASSINATURA' },
        });

        return `
Perfeito! Recebemos todas as provas!  

Agora um advogado irá analisar seu caso e entrar em contato com você.
`.trim();
      }

      // Recebe qualquer mídia sem processar
      if (documentosRecebidos.length > 0) {
        return 'Arquivo recebido! Pode enviar mais ou digitar *FINALIZAR* quando terminar.';
      }

      return 'Fico no aguardo. Pode enviar mais provas ou digitar *FINALIZAR*.';
    }



    const messages: ModelMessage[] = historico
      .filter(m => m.type === 'text' && typeof m.content === 'string')
      .map(m => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content!,
      }));

    /* -----------------------------
       IA
    ----------------------------- */
    const result = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      system: this.buildSystemPrompt(buildContext(conversation)),
      messages,     
      tools: {
        atualizarEtapa: atualizarEtapaTool,
        registrarFatos: registrarFatosTool,
        definirTipoCaso: definirTipoCasoTool,
      },
      toolChoice: 'auto',
    });


    const toolCalls = result.toolCalls?.filter(tc =>
      ['registrarFatos', 'atualizarEtapa', 'definirTipoCaso'].includes(tc.toolName)
    ) ?? [];
    let textoResposta = result.text ?? '';

    if (textoResposta) {
      textoResposta = textoResposta
        .replace(/<function=[\s\S]*?<\/function>/g, '') // Remove a tag completa
        .replace(/<tool_code>[\s\S]*?<\/tool_code>/g, '') // Previne outros formatos comuns
        .trim();
    }

    console.log('[DEBUG] IA FALA:', textoResposta);


    const callTipoCaso = toolCalls.find(
      t => t.toolName === 'definirTipoCaso'
    );

    if (callTipoCaso) {
      const rawArgs = (callTipoCaso as any).args ?? {};
      const args = typeof rawArgs === 'string'
        ? JSON.parse(rawArgs)
        : rawArgs;

      await prisma.conversation.update({
        where: { customerPhone },
        data: {
          tipoCaso: args.tipoCaso,
        },
      });

      tipoCaso = args.tipoCaso; // atualiza variável local
    }

    /* -----------------------------
         PROCESSAMENTO DAS TOOLS
     ----------------------------- */
    if (toolCalls.length > 0) {

      // 1. Encontra as tools específicas
      const callRegistrar = toolCalls.find(t => t.toolName === 'registrarFatos');
      const callAtualizar = toolCalls.find(t => t.toolName === 'atualizarEtapa');

      // 2. PRIORIDADE 1: Salvar Dados (registrarFatos)
      if (callRegistrar) {
        const rawArgs = (callRegistrar as any).args ?? (callRegistrar as any).input ?? {};
        const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

        console.log('[DEBUG] Salvando Fatos:', args);

        const parsed = registrarFatosSchema.safeParse(args);

        if (!parsed.success) {
          console.warn('[IA tentou registrar fatos incompletos]', parsed.error);

          // ❌ IGNORA a tool call
          // ✅ segue o fluxo normal perguntando o que falta
          return this.responder({
            intent: 'AGUARDAR_RESPOSTA',
            conversation: buildContext(conversation),
          });
        }

        // 1. Salva no banco
        await prisma.conversation.update({
          where: { customerPhone },
          data: {
            tempData: {
              ...(conversation.tempData as object ?? {}),
              ...args,
            },
          },
        });

        // 2. Recarrega a conversa atualizada
        conversation = await prisma.conversation.findUnique({
          where: { customerPhone },
        }) as NonNullable<typeof conversation>;

        // --- LÓGICA DE TRANSIÇÃO AUTOMÁTICA (AUTO-COMPLETE) ---
        const fatos = conversation.tempData as any;

        const temDinamica = !!fatos?.dinamica_do_dano;
        const temEmpresa = !!fatos?.empresa;
        const temData = !!fatos?.data_do_ocorrido;
        const temPrejuizo = !!fatos?.prejuizo;
        if (
          conversation.workflowStep === 'COLETA_FATOS' &&
          temDinamica &&
          temEmpresa &&
          temData &&
          temPrejuizo
        ) {
          await prisma.conversation.update({
            where: { customerPhone },
            data: {
              workflowStep: 'COLETA_DOCS',
              tempData: {
                ...(conversation.tempData as object ?? {}),
                aguardandoDocumentos: true,
              },
            },
          });
          estadoAtual = 'COLETA_DOCS';
          return this.responder({
            intent: 'TRANSICAO_ETAPA',
            conversation: {
              estadoAtual: 'COLETA_DOCS',
              tipoCaso,
              documentosFaltantes: documentosPendentesAtuais.map(d => d.descricao),
              presentedAt: conversation.presentedAt,
              tempData: conversation.tempData,
            },
          });
        }
      }

      // 3. PRIORIDADE 2: Mudança de Fluxo (atualizarEtapa)
      if (callAtualizar) {
        console.log('[DEBUG] Atualizando Etapa via Tool');

        const proximaEtapa = PROXIMA_ETAPA_POR_FLUXO[estadoAtual];

        if (proximaEtapa) {
          await prisma.conversation.update({
            where: { customerPhone },
            data: { workflowStep: proximaEtapa },
          });

          return this.responder({
            intent: 'TRANSICAO_ETAPA',
            conversation: {
              estadoAtual: proximaEtapa,
              tipoCaso,
              documentosFaltantes: documentosPendentesAtuais.map(d => d.descricao),
              presentedAt: conversation.presentedAt,
              tempData: conversation.tempData,
            },
          });
        }
      }
    }

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
        await prisma.conversation.update({
          where: { customerPhone },
          data: { workflowStep: proximaEtapa },
        });

        return this.responder({
          intent: 'TRANSICAO_ETAPA',
          conversation: {
            estadoAtual: proximaEtapa,
            tipoCaso,
            documentosFaltantes: documentosPendentesAtuais.map(d => d.descricao),
            presentedAt: conversation.presentedAt,
          },
        });
      }
    }

    if (!textoResposta) {
      return this.responder({
        intent: 'AGUARDAR_RESPOSTA',
        conversation: buildContext(conversation),
      });
    }

    return textoResposta;
  }


  /* ---------------------------------
     PROMPT
  --------------------------------- */

  //   private buildSystemPrompt(context: {
  //     estadoAtual: WorkflowStep;
  //     tipoCaso: TipoCaso;
  //     documentosFaltantes: string[];
  //     documentosEsperadosAgora: string[];
  //     presentedAt: Date | null;
  //     saudacaoTempo?: string;
  //     fatos?: any;
  //   }) {
  //     return `
  // VOCÊ É Carol, advogada do escritório RCS Advocacia.

  // CONTEXTO CRÍTICO:
  // - Apresentação já realizada: ${context.presentedAt ? 'SIM' : 'NÃO'}
  // - Saudação do Horário Atual: "${context.saudacaoTempo || 'Olá'}" (USE ESTA).
  // - Fatos Coletados: ${JSON.stringify(context.fatos || {})}

  // REGRAS ABSOLUTAS DE APRESENTAÇÃO:
  // - A apresentação ("Me chamo Carol...", "sou advogada...") só pode ocorrer UMA ÚNICA VEZ em toda a conversa.
  // - Se "Apresentação já realizada" for SIM, é PROIBIDO repetir qualquer forma de apresentação.
  // - Se o cliente já iniciou ou descreveu um problema, é PROIBIDO perguntar "como posso ajudar" ou pedir o nome.
  // - Se a conversa já possui histórico, NÃO se comporte como primeira interação.

  // MEMÓRIA:
  // - Você recebe TODO o histórico da conversa.
  // - NÃO repita informações, perguntas ou saudações já feitas.
  // - Continue a conversa exatamente de onde ela parou.

  // APRESENTACAO_INICIAL (somente se Apresentação já realizada = NÃO):
  // - Cumprimente de acordo com o horário.
  // - Use EXATAMENTE a saudação: "${context.saudacaoTempo || 'Olá'}".
  // - Diga: "Me chamo Carol, sou advogada do escritório RCS Advocacia".
  // - Pergunte se está tudo bem.
  // - Pergunte o nome do cliente de forma natural (ex: "Como posso te chamar?").
  // - Máximo de 2 frases curtas.
  // - NÃO peça relato detalhado.
  // - NÃO peça documentos.


  // RITMO DE CONVERSA (OBRIGATÓRIO):
  // - Nunca solicite documentos logo após uma saudação.
  // - Nunca combine acolhimento emocional + pedido de documento.
  // - Antes de qualquer solicitação, confirme entendimento.
  // - Explique brevemente o motivo de qualquer pedido.

  // COLETA_FATOS (CRITÉRIO RIGOROSO):
  // Para finalizar esta etapa e chamar 'atualizarEtapa', você precisa OBRIGATORIAMENTE de 3 pilares.
  // Analise o histórico e verifique mentalmente:

  // 1. [ ] DINÂMICA DO DANO (O que houve + Detalhe do prejuízo/transtorno)
  // 2. [ ] EMPRESA/RÉU (Quem causou)
  // 3. [ ] DATA DO OCORRIDO (Quando foi, mês/ano aproximado)

  // REGRA DE OURO ANTI-LOOP:
  // - Antes de responder, verifique quais itens acima JÁ FORAM informados.
  // - NUNCA pergunte algo que o usuário já respondeu ou que você já citou no resumo.
  // - Se o usuário já disse o nome da empresa, NÃO pergunte "Qual a empresa?".
  // - Se falta apenas a DATA, sua ÚNICA pergunta deve ser: "Entendi. E quando isso aconteceu?"

  // EXEMPLO DE RACIOCÍNIO:
  // - Tenho o problema? Sim.
  // - Tenho a empresa? Sim.
  // - Tenho a data? NÃO.
  // -> AÇÃO: Perguntar apenas a data.

  // SE O RELATO ESTIVER COMPLETO (Os 3 itens preenchidos):
  // - Não faça mais perguntas.
  // - CHAME A TOOL 'atualizarEtapa' IMEDIATAMENTE
  // Nesta etapa:
  // - Faça UMA pergunta por vez.
  // - Se faltar alguma informação, pergunte apenas sobre o ponto faltante.
  // - Não repita perguntas já respondidas.
  // - Qualquer resposta em TEXTO é considerada ERRO.
  // - A única resposta válida é chamar a tool "atualizarEtapa".

  // REGRA CRÍTICA DE TOOLS:
  // - A tool "atualizarEtapa" NÃO recebe parâmetros.
  // - Ela apenas sinaliza que a etapa atual foi concluída.
  // - A definição da próxima etapa é responsabilidade do sistema.
  // - Dados do caso devem ser enviados SOMENTE pela tool "registrarFatos".
  // - Nunca combine dados e transição na mesma tool.

  // TOM DE VOZ:
  // - Profissional, humano e acolhedor.
  // - Frases curtas.
  // - Sem emojis.
  // - Sem linguagem publicitária ou institucional.

  // SUA FUNÇÃO:
  // - Coletar informações iniciais do cliente.
  // - Organizar documentos.
  // - Encaminhar o caso para análise humana.
  // - NUNCA prestar aconselhamento jurídico.

  // REGRAS INEGOCIÁVEIS:
  // 1. NUNCA afirme ou sugira direito, ganho de causa ou indenização.
  // 2. NUNCA dê opinião jurídica, previsão de resultado ou valores.
  // 3. Para avançar etapas, VOCÊ DEVE chamar a tool "atualizarEtapa".
  // 4. NÃO avance etapas apenas com texto.
  // 5. Faça no máximo UMA pergunta objetiva por mensagem.
  // 6. Se a etapa atual estiver completa, CHAME a tool adequada.
  // 7. Dados sensíveis (ex: saúde): solicite APENAS documentos, nunca descrições.

  // VOCÊ NÃO DECIDE:
  // - Qual etapa vem a seguir.
  // - Se documentos são suficientes.
  // - Se o fluxo deve avançar sem tool.

  // FLUXO ATUAL:
  // - Etapa: ${context.estadoAtual}
  // - Tipo de caso: ${context.tipoCaso}

  // DOCUMENTOS PENDENTES:
  // ${context.documentosFaltantes.length ? context.documentosFaltantes.join(', ') : 'Nenhum'}

  // COMPORTAMENTO FINAL:
  // - Linguagem simples.
  // - Sem termos técnicos.
  // - Seja clara, educada e objetiva.
  // - Em caso de dúvida, peça esclarecimento antes de avançar.

  // FLUIDEZ OBRIGATÓRIA:
  // - Responda como uma conversa real de WhatsApp.
  // - Não antecipe perguntas.
  // - Sempre aguarde resposta antes de avançar.
  // - Nunca repita saudações já feitas.
  // `;

  //   }

  private buildSystemPrompt(context: {
    estadoAtual: WorkflowStep;
    tipoCaso: TipoCaso;
    documentosFaltantes: string[];
    documentosEsperadosAgora: string[]; // Garanta que isso está vindo no context
    presentedAt: Date | null;
    saudacaoTempo?: string;
    fatos?: any;
  }) {
    // Tratamento seguro dos fatos para o prompt não quebrar se vier vazio
    const fatosTexto = context.fatos ? JSON.stringify(context.fatos) : "Nenhum fato registrado ainda.";

    // Identifica o próximo documento da fila para a IA pedir assertivamente
    const proximoDocumento = context.documentosFaltantes[0] || "os demais documentos";

    return `
# IDENTIDADE
Você é Carol, advogada especialista em triagem do escritório RCS Advocacia.
Sua missão é acolher o cliente, entender o problema e organizar a documentação para a equipe jurídica.

# TOM DE VOZ E PERSONALIDADE (CRÍTICO)
- **Canal:** Você está no WhatsApp. Use linguagem natural, fluida e levemente informal (mas profissional).
- **Empatia:** Nunca seja fria. Se o cliente relatar um problema, valide o sentimento dele antes de pedir dados (Ex: "Imagino o transtorno que isso causou. Sinto muito.").
- **Clareza:** Evite "jurisdiquês". Fale a língua do cliente.
- **Formatação:** Use quebras de linha para não criar "muros de texto".

# CONTEXTO ATUAL
- Etapa do Fluxo: ${context.estadoAtual}
- Cliente já se apresentou? ${context.presentedAt ? 'SIM' : 'NÃO'}
- Saudação do horário: "${context.saudacaoTempo || 'Olá'}"
- Fatos já entendidos (Memória): ${fatosTexto}
- **PRÓXIMO DOCUMENTO ALVO:** ${proximoDocumento}

---

# DIRETRIZES POR ETAPA

## 1. APRESENTAÇÃO (Se "Cliente já se apresentou" = NÃO)
- Objetivo: Criar conexão.
- Ação: Use a saudação do horário. Diga seu nome e cargo ("sou advogada da RCS").
- Pergunta: Pergunte o nome do cliente ou como pode ajudar, de forma aberta.
- **Erro comum:** Não peça relato detalhado ou documentos logo no "Oi".

## 2. COLETA DE FATOS (Se Etapa = COLETA_FATOS)
- Objetivo: Preencher as lacunas mentais: [FATO OCORRIDO], [EMPRESA], [DATA], [PREJUIZO].
- **Técnica de Ouro:** Validação + Pergunta.
  - Ruim: "Qual a empresa?"
  - Bom: "Entendi, realmente é uma situação frustrante esperar tanto. E qual foi a companhia aérea?"
- **Regra de Fluxo:** Pergunte UM dado por vez. Não bombardeie o cliente.
- **Inteligência:** Se o cliente já disse a data no texto anterior, NÃO PERGUNTE DE NOVO. Apenas confirme.
- **Fim da Etapa:** Se você já tem os 4 pilares (Fato Ocorrido, Empresa, Data, Prejuízo), pare de perguntar e chame a tool 'atualizarEtapa'.
- É PROIBIDO chamar a tool "registrarFatos" se QUALQUER campo estiver incompleto.
- Nunca envie strings vazias.
- Se faltar qualquer informação, faça UMA pergunta objetiva e aguarde resposta.
- Apenas chame "registrarFatos" quando todos os campos estiverem totalmente preenchidos.

### REGRA CRÍTICA – REGISTRO DE FATOS (OBRIGATÓRIO)

Ao chamar a tool "registrarFatos":

- NÃO resuma.
- NÃO use rótulos genéricos como:
  "atraso de voo", "problema bancário", "negativa do plano".

- A descrição DEVE conter:
  • o que aconteceu
  • por quanto tempo
  • impacto real na vida do cliente
  • consequências práticas (perda de tempo, compromisso, gastos, estresse)

Exemplo RUIM:
"atraso de voo"

Exemplo CORRETO:
"O voo sofreu atraso de aproximadamente 12 horas, fazendo com que o cliente permanecesse no aeroporto durante todo o período, perdendo uma reunião profissional importante e enfrentando desgaste físico e emocional."

CLASSIFICAÇÃO DO CASO (OBRIGATÓRIO):

Assim que identificar claramente o tipo do caso, você DEVE chamar a tool
"definirTipoCaso".

Exemplos:
- Atraso, cancelamento ou overbooking de voo → tipoCaso = VOO
- Bloqueio de conta ou problema bancário → BANCO
- Negativa de plano ou tratamento → SAUDE

Se o tipo ainda não estiver claro, NÃO chame a tool.
Nunca invente.

REGRA ABSOLUTA DE TOOLS:
- O nome da tool é EXATAMENTE: "registrarFatos"
- É PROIBIDO inventar, abreviar ou alterar o nome da tool
- NUNCA use: "regarFatos", "registrar_fatos", "salvarFatos"

## 3. TRANSIÇÃO E DOCUMENTOS (Se Etapa = COLETA_DOCS)

**CONTEXTO DESTE MOMENTO**
- O cliente ACABOU de relatar os fatos.
- Ele já sabe que você entendeu o caso.

**REGRAS ABSOLUTAS**
- NÃO reexplique o caso.
- NÃO faça resumo longo.
- NÃO repita empresa, data ou dinâmica do dano.
- Use no máximo **UMA frase curta** de confirmação
  (ex: "Perfeito, já registrei tudo aqui.").

  ## 4. COLETA_DOCS_EXTRA
- Você NÃO analisa arquivos
- Você NÃO valida documentos
- Você NÃO decide se algo é suficiente
- Apenas confirme recebimento
- Aguarde o cliente digitar "FINALIZAR"
- Nunca avance etapa por conta própria

**ROTEIRO OBRIGATÓRIO**
1. Confirme o avanço de forma breve.
2. Solicite os documentos pendentes de forma clara e direta.
3. Liste apenas os documentos necessários agora:
   ${context.documentosFaltantes.join(', ')}.

  
  **IMPORTANTE - PROCESSAMENTO DE ARQUIVOS:**
- Você NÃO analisa arquivos nem imagens.
- O sistema avisará quando um documento for validado.
- Seu papel é apenas pedir o próximo documento quando instruído.
  - Após confirmar, PEÇA O PRÓXIMO DOCUMENTO: "${proximoDocumento}".

---

# LIMITES ÉTICOS E TÉCNICOS (INVIOLÁVEIS)
1. **Promessas:** NUNCA garanta ganho de causa ou valores de indenização ("Você vai ganhar X reais"). Diga "Vamos analisar a viabilidade".
2. **Consultoria:** Não tire dúvidas jurídicas complexas. Seu foco é triagem.
3. **Tools:**
   - Use 'registrarFatos' para salvar dados novos.
   - Use 'atualizarEtapa' APENAS quando tiver certeza que a etapa atual acabou.
   - NUNCA avance de etapa apenas falando. Você PRECISA chamar a tool.

# EXTREMAMENTE IMPORTANTE
- Se o usuário estiver irritado, mantenha a calma e seja solícita.

REGRAS DE SEGURANÇA:
- Se "Fatos Coletados" já tiver 3 itens preenchidos, NÃO faça mais perguntas sobre o ocorrido. Peça os documentos.
- Se o cliente disser apenas "Certo" ou "Ok" após você pedir documentos, apenas reforce o pedido ou aguarde o upload.

Agora, responda à última mensagem do cliente seguindo estas diretrizes.
`;
  }


  private async responder(input: {
    intent: Intent;
    contexto?: Record<string, any>;
    conversation: {
      estadoAtual: WorkflowStep;
      tipoCaso: TipoCaso;
      documentosFaltantes: string[];
      documentosEsperadosAgora?: string[];
      presentedAt: Date | null;
      tempData?: any;
    };
  }) {
    const system = this.buildSystemPrompt({
      estadoAtual: input.conversation.estadoAtual,
      tipoCaso: input.conversation.tipoCaso,
      documentosFaltantes: input.conversation.documentosFaltantes,
      documentosEsperadosAgora: input.conversation.documentosEsperadosAgora ?? [],
      presentedAt: input.conversation.presentedAt,
      fatos: input.conversation.tempData,
    });

    // --- CORREÇÃO AQUI: Forçar a IA a agir na transição ---
    let mensagemInstrucao = JSON.stringify({
      intent: input.intent,
      contexto: input.contexto ?? {},
    });

    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      temperature: 0.3, // Temperatura baixa para ser obediente
      system,      
      prompt: mensagemInstrucao, // Envia a instrução forte em vez do JSON simples
    });

    // Limpeza de alucinação (caso ainda exista)
    let textoLimpo = text ?? '';
    if (textoLimpo) {
      textoLimpo = textoLimpo
        .replace(/<function=[\s\S]*?<\/function>/g, '')
        .replace(/<tool_code>[\s\S]*?<\/tool_code>/g, '')
        .trim();
    }

    return textoLimpo;
  }

  // // ======================================================
  // // 🎙️ TRANSCRIÇÃO DE ÁUDIO (WHATSAPP / PTT)
  // // ======================================================
  // async transcreverAudio(
  //   audioBuffer: Buffer,
  //   mimeType: string
  // ): Promise<string> {
  //   const file = new File(
  //     [audioBuffer],
  //     'audio.ogg',
  //     { type: mimeType }
  //   );

  //   const transcription =
  //     await this.groqClient.audio.transcriptions.create({
  //       file,
  //       model: 'whisper-large-v3',
  //       language: 'pt',
  //       response_format: 'json',
  //     });

  //   return transcription.text?.trim() || '';
  // }



}
