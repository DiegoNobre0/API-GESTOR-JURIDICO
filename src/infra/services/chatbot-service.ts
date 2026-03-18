import { generateText, tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { openai } from '@ai-sdk/openai';

import { generateObject } from 'ai';
import { detectGreeting } from './utils/greeting.util.js';
import type { ModelMessage } from 'ai';
import { AdvogadoAssistantService } from './assistant-financeiro.service.js';
import { MailService } from './mail-service.js';




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

type TipoCaso = 'VOO_ONIBUS' | 'BANCO' | 'SAUDE' | 'TRABALHO' | 'GERAL' | 'BPC' | 'INSS' | 'GOV';
type TemperaturaLead = 'QUENTE' | 'MORNO' | 'FRIO';


export interface ClassificacaoResult {
  tipoCaso: TipoCaso;
  qualificacaoLead: TemperaturaLead;
}

const tipoCasoEnum = z.enum([
  'VOO_ONIBUS',
  'BANCO',
  'SAUDE',
  'TRABALHO',
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
    .min(5, 'Descreva o ocorrido com mais detalhes')
    .describe(
      'Descrição detalhada do que aconteceu, incluindo contexto, duração, transtornos e consequências práticas'
    ),

  empresa: z
    .string()
    .min(2)
    .refine(val => !/não informad|não sei/i.test(val), 'VOCÊ PRECISA PERGUNTAR A EMPRESA. Não envie placeholders.')
    .describe('Nome da empresa responsável pelo ocorrido'),

  data_do_ocorrido: z
    .string()
    .min(4)
    .refine(val => !/não informad|não sei|não mencionad/i.test(val), 'VOCÊ PRECISA PERGUNTAR A DATA. Não envie placeholders.')
    .describe('Data ou período aproximado do ocorrido. OBRIGATÓRIO PERGUNTAR.'),

  prejuizo: z
    .string()
    .min(1)
    .refine(val => !/não informad|não sei/i.test(val), 'VOCÊ PRECISA PERGUNTAR O PREJUÍZO. Não envie placeholders.')
    .describe('Descrição dos prejuízos financeiros, profissionais ou pessoais sofridos'),
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
}): Promise<ClassificacaoResult> {

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      temperature: 0,
      schema: z.object({
        tipoCaso: z.enum(['VOO_ONIBUS', 'BANCO', 'SAUDE', 'TRABALHO', 'BPC', 'INSS', 'GOV', 'GERAL']),
        qualificacaoLead: z.enum(['QUENTE', 'MORNO', 'FRIO'])
      }),
      system: `
Você é um classificador jurídico sênior.
Analise os fatos e retorne exclusivamente os campos definidos no schema.

REGRAS DE CLASSIFICAÇÃO PARA "tipoCaso" (Escolha APENAS UMA):
- VOO_ONIBUS: Atraso, cancelamento, overbooking, bagagem
- BANCO: Conta bloqueada, banco, cartão, Pix, fraudes financeiras
- SAUDE: Plano de saúde, tratamento, negativa, aumento abusivo
- TRABALHO: Rescisão indireta, problemas no emprego, assédio, FGTS, horas extras, carteira não assinada
- BPC: Benefício assistencial, deficiência, baixa renda (LOAS)
- INSS: Aposentadoria, auxílio doença, pensão
- GOV: GOV.BR, serviços públicos digitais
- GERAL: Dúvida ou genérico que não se encaixa acima

REGRAS DE CLASSIFICAÇÃO PARA "qualificacaoLead" (Temperatura do cliente):
- QUENTE: Relato claro, prejuízo financeiro ou moral evidente, empresa bem identificada e data do ocorrido recente. Causa pronta para atuar.
- MORNO: Tem potencial, mas o relato está confuso, faltam detalhes cruciais ou o prejuízo é muito baixo.
- FRIO: Relato sem sentido, nenhum dano claro, ou caso muito antigo (risco alto de prescrição).
      `,
      prompt: `
FATOS RELATADOS:
${JSON.stringify(fatos)}
      `,
    });

    // object já vem validado pelo Zod
    return object;

  } catch (error) {
    console.error("❌ Erro na classificação IA:", error);

    // Fallback seguro
    return {
      tipoCaso: 'GERAL',
      qualificacaoLead: 'MORNO'
    };
  }
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
  VOO_ONIBUS: [
    { codigo: 'PASSAGEM', descricao: 'Passagens originais e as novas (se houver)' },
    { codigo: 'ATRASO', descricao: 'Comprovante do atraso ou cancelamento' },
    { codigo: 'GASTOS', descricao: 'Comprovantes de gastos extras (alimentação, hotel, etc)' },
    { codigo: 'RIB', descricao: 'RIB (Registro de Incidente de Bagagem) - Se for extravio/dano' },
    { codigo: 'OBS', descricao: 'Se ainda não fez reclamação, registre no *consumidor.gov.br* e nos envie o print. Nosso tutorial gestor-juridico-front.vercel.app/tutorial' },
  ],
  BANCO: [
    { codigo: 'EXTRATO', descricao: 'Extratos bancários detalhados' },
    { codigo: 'BLOQUEIO', descricao: 'Print da mensagem do banco ou chat avisando do bloqueio/fraude. Se não tiver, tire um print do contato com o banco.' },
  ],
  SAUDE: [
    // RG e Comprovante de Residência já são pedidos no DOCUMENTOS_BASE
    { codigo: 'CARTEIRINHA', descricao: 'Carteirinha do plano de saúde (física ou digital)' },
    { codigo: 'CONTRATO', descricao: 'Contrato ou proposta de adesão ao plano (se tiver acesso)' },
    { codigo: 'CASO_NEGATIVA', descricao: '👉 SE FOR NEGATIVA: Print/e-mail ou ofício da recusa, Laudo médico com CID justificando a necessidade, e Exames/pedidos médicos.', sensivel: true },
    { codigo: 'CASO_REVISIONAL', descricao: '👉 SE FOR AUMENTO ABUSIVO: Histórico completo de pagamentos mensais desde o início do contrato (boletos, faturas ou extrato do app).' },
  ],
  TRABALHO: [
    { codigo: 'CTPS_DIGITAL', descricao: 'Print/foto da Carteira de Trabalho Digital (mostrando os vínculos)' },
    { codigo: 'EXTRATO_FGTS', descricao: 'Extrato do FGTS tirado do aplicativo oficial (para vermos se a empresa está depositando)' },
    { codigo: 'PROVAS_TRABALHO', descricao: 'Provas do que aconteceu (prints de WhatsApp, e-mails, recibos, fotos de cartão de ponto ou lista de testemunhas)' },
  ],
  BPC: [
    // RG e Comprovante de Residência já são pedidos no DOCUMENTOS_BASE    
    { codigo: 'NIS', descricao: 'Cartão ou número do NIS (11 dígitos) e Folha do CadÚnico' },
    { codigo: 'DOCS_FAMILIA', descricao: 'RG/CPF e comprovante de renda de TODOS os membros da família que moram na mesma casa' },
    { codigo: 'SENHA_GOV', descricao: 'Acesso (Login e Senha) do portal Gov.br (para verificarmos o cadastro no INSS)' },
    { codigo: 'CASO_DEFICIENTE', descricao: '👉 SE FOR POR DEFICIÊNCIA/DOENÇA: Laudo médico atualizado com CID, relatórios de especialistas e exames.', sensivel: true },
    { codigo: 'CASO_IDOSO', descricao: '👉 SE FOR IDOSO (65+): Certidão de nascimento ou casamento e Carteira de Trabalho (CTPS).' },
  ],
  INSS: [
    { codigo: 'SENHA_GOV', descricao: 'Senha do portal GOV.BR (necessária para análise de viabilidade)' },
    { codigo: 'CTPS', descricao: 'Carteira de Trabalho (CTPS)' },
  ],
  GOV: [
    { codigo: 'GOVBR', descricao: 'Print da conta GOV.BR ou dados de acesso' },
  ],
  GERAL: [
    { codigo: 'PROVAS', descricao: 'Todos os documentos, prints de conversas, fotos e provas que você tiver relacionadas ao seu caso' },
  ],
};


/* ---------------------------------
   LINKS DE ASSINATURA (ZAPSIGN)
--------------------------------- */
const LINKS_ASSINATURA: Record<TipoCaso, { contrato: string; procuracao: string }> = {
  SAUDE: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/e393eb9d-23e0-49cc-965c-6cc31d020e1c',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/a5e0c61b-2f72-469b-b952-8f92ecd3f151',
  },
  BPC: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/95d8de18-3f25-4d9b-b163-e5cf8c168136',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/dfdf1a1a-95c3-4b8b-903d-7eb0c245914d',
  },
  INSS: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/95d8de18-3f25-4d9b-b163-e5cf8c168136',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/dfdf1a1a-95c3-4b8b-903d-7eb0c245914d',
  },
  VOO_ONIBUS: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/65194d71-ad5d-4192-a2b2-5838f664a6dc',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/52151f47-c845-45a7-beae-6cd1042d5ecb',
  },

  BANCO: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/65194d71-ad5d-4192-a2b2-5838f664a6dc',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/52151f47-c845-45a7-beae-6cd1042d5ecb',
  },
  TRABALHO: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/65194d71-ad5d-4192-a2b2-5838f664a6dc',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/52151f47-c845-45a7-beae-6cd1042d5ecb',
  },
  GOV: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/65194d71-ad5d-4192-a2b2-5838f664a6dc',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/52151f47-c845-45a7-beae-6cd1042d5ecb',
  },
  GERAL: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/65194d71-ad5d-4192-a2b2-5838f664a6dc',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/52151f47-c845-45a7-beae-6cd1042d5ecb',
  },
};


/* ---------------------------------
   SERVICE
--------------------------------- */

export class ChatbotService {
  constructor() { }

  async chat(message: string, customerPhone: string) {

    let conversation = await prisma.conversation.findUnique({
      where: { customerPhone },
    });

    assertConversation(conversation);

    const texto = message.trim();
    const agora = new Date();


    if (this.detectPedidoAjuda(texto) && conversation.workflowStep !== 'COLETA_FATOS') {
      await this.notificarAdvogado('AJUDA', conversation);
      return 'Entendi que você precisa de ajuda. Já notifiquei um de nossos advogados, que irá te contatar o mais breve possível para te auxiliar, ok? Enquanto isso, se quiser, pode continuar me enviando informações ou documentos sobre o seu caso.';
    }

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
    if (texto.toLowerCase().startsWith('/dados')) {

      let numeroLimpo = customerPhone.replace(/\D/g, '');

      if (numeroLimpo.length >= 12 && numeroLimpo.startsWith('55')) {
        numeroLimpo = numeroLimpo.substring(2);
      }

      // Aqui limpamos o comando! Ex: "/dados paguei 50" vira "paguei 50"
      const comandoLimpo = texto.replace(/^\/dados[:\s]*/i, '').trim();

      const ddd = numeroLimpo.substring(0, 2);
      const final4 = numeroLimpo.slice(-4);
      const meio4 = numeroLimpo.slice(-8, -4);

      const advogado = await prisma.user.findFirst({
        where: {
          AND: [
            { telefone: { contains: ddd } },
            { telefone: { contains: meio4 } },
            { telefone: { contains: final4 } }
          ],
          ativo: true
        }
      });

      if (advogado) {
        if (!comandoLimpo) {
          return `Olá ${advogado.nome}! Para lançar despesas, digite o comando e o valor. Exemplo:\n\n*/dados: paguei 150 reais de luz*`;
        }

        const assistente = new AdvogadoAssistantService();
        // 👇 AQUI ESTÁ A CORREÇÃO: Enviando o comandoLimpo para a IA!
        const resposta = await assistente.processarComando(comandoLimpo, advogado.id);
        return resposta;
      }
    }

    // Se o returnFlow estiver preenchido, ele já está no meio da consulta (ex: digitando CPF ou escolhendo o número)
    if (conversation.returnFlow) {
      return this.handleRetornoCliente(texto, conversation);
    }

    // Intercepta se ele digitar alguma palavra-chave de processo, mesmo se estiver no meio de outra coisa
    if (this.detectarConsultaProcesso(texto) && conversation.workflowStep !== 'FINALIZADO') {

      await prisma.conversation.update({
        where: { customerPhone },
        data: { returnFlow: 'AGUARDANDO_CPF' } // Pula o menu e vai direto pedir o CPF
      });

      return `Olá! 🏢 Para localizar o andamento dos seus processos, por favor, me informe o seu *CPF* (apenas números).`;
    }


    if (conversation.workflowStep === 'FINALIZADO') {
      return this.handleRetornoCliente(texto, conversation);
    }


    let estadoAtual = conversation.workflowStep as WorkflowStep;

    // =============================
    // CLIENTE AVISOU QUE ASSINOU
    // =============================
    if (
      estadoAtual === 'ASSINATURA' &&
      this.detectAssinaturaConcluida(texto)
    ) {
      await this.notificarAdvogado('ASSINOU', conversation);

      // await prisma.conversation.update({
      //   where: { customerPhone },
      //   data: {
      //     workflowStep: 'FINALIZADO'
      //   }
      // });

      return `
Perfeito! Recebi sua confirmação 🙌

Nossa equipe jurídica já foi notificada e dará continuidade na análise do seu caso.

Em breve você receberá atualizações.
`.trim();
    }

    let tipoCaso = (conversation.tipoCaso as TipoCaso) ?? 'GERAL';
    const jaApresentado = !!conversation.presentedAt;

    const { isGreeting, isPureGreeting } = detectGreeting(texto);


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
        await this.notificarAdvogado('PRIMEIRO_CONTATO', conversation);

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
      if (documentosRecebidos.length === 2) {
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
            data: {
              tipoCaso: tipoInferido.tipoCaso,
              qualificacaoLead: tipoInferido.qualificacaoLead,
            },
          });

          conversation = await prisma.conversation.findUnique({
            where: { customerPhone },
          }) as NonNullable<typeof conversation>;

          tipoCaso = tipoInferido.tipoCaso;
        }

        return gerarMensagemDocsExtras(tipoCaso);

      }

      return `Documento recebido!   
      Agora preciso de: *${documentosPendentesAtuais.map(d => d.descricao).join(', ')}*.`;
    }

    if (estadoAtual === 'COLETA_DOCS_EXTRA') {

      // Cliente finalizou manualmente
      if (texto.toUpperCase().includes('FINALIZAR')) {

        // SE FOR CASO GERAL: Envia email e paralisa o envio de links automáticos
        if (tipoCaso === 'GERAL') {
          await prisma.conversation.update({
            where: { customerPhone },
            data: {
              workflowStep: 'ASSINATURA', 
              fallbackStage: 0
            },
          });

          await this.notificarAdvogado('CASO_ESPECIFICO', conversation);

          return `
Perfeito! Recebemos todas as provas.

Nossa equipe jurídica já foi notificada para fazer uma análise inicial e vai gerar um *contrato e procuração totalmente personalizados* para você.

Em breve, um de nossos advogados vai te chamar por aqui com os documentos para assinatura!
`.trim();
        }


        await prisma.conversation.update({
          where: { customerPhone },
          data: {
            workflowStep: 'ASSINATURA',
            fallbackStage: 0
          },
        });

        const linksDoCaso = LINKS_ASSINATURA[tipoCaso] || LINKS_ASSINATURA['GERAL'];
        const contrato = linksDoCaso.contrato;
        const procuracao = linksDoCaso.procuracao;

        return `
Perfeito! Recebemos todas as provas.

Agora só precisamos da sua assinatura digital para iniciar a análise do seu caso.

📄 Contrato:
${contrato}

🖊️ Procuração:
${procuracao}

Leva menos de 2 minutos 😉

Assim que finalizar, me avise por aqui.
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
      model: openai('gpt-4o-mini'),
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

    // if (toolCalls.some(t => t.toolName === 'registrarFatos')) {
    //   textoResposta = "Entendi perfeitamente a situação. Vou organizar essas informações para a nossa equipe jurídica.";
    //   console.log('✅ [TOOL CALL DETECTADA] Tool registrarFatos foi acionada com sucesso.');
    // }

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

        if (conversation.workflowStep !== 'COLETA_FATOS') {
          console.log('[DEBUG] Ignorando registrarFatos fora da etapa correta');
          return textoResposta || null;
        }
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
            contexto: {
              instrucaoExtra: "Você tentou registrar fatos incompletos. Faça a pergunta ao cliente sobre a informação que está faltando (Data, Empresa, etc) em UMA frase curta e sem formatar em lista."
            }
          });
        }

        type TempDataFatos = {
          dinamica_do_dano?: string;
          empresa?: string;
          data_do_ocorrido?: string;
          prejuizo?: string;
          aguardandoDocumentos?: boolean;
        };

        const currentTempData = (conversation.tempData ?? {}) as TempDataFatos;

        // 1. Salva no banco
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

        const fatosParaValidar = conversation.tempData as any;
        const fatosEstaoCompletos = fatosParaValidar?.dinamica_do_dano && fatosParaValidar?.empresa && fatosParaValidar?.data_do_ocorrido && fatosParaValidar?.prejuizo;

        if (estadoAtual === 'COLETA_FATOS' && !fatosEstaoCompletos) {
          console.log('[DEBUG] IA tentou avançar sem os 4 fatos preenchidos. Bloqueado pelo sistema.');
          return this.responder({
            intent: 'AGUARDAR_RESPOSTA',
            conversation: buildContext(conversation),
            contexto: {
              instrucaoExtra: "Você tentou avançar de etapa, mas ainda faltam dados obrigatórios. Faça a pergunta sobre o que está faltando."
            }
          });
        }

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
Você é Carol, assistente especialista em triagem do escritório RCS Advocacia.
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
- Ação: Use a saudação do horário. Diga seu nome e cargo ("sou assistente da RCS").
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

Enquanto estiver coletando dados:
- Pense como uma pessoa conversando no WhatsApp.
- Não pense como alguém preenchendo um formulário visível.
- O formulário é interno e invisível.
- O cliente não deve perceber checklist.

Durante a coleta, sua resposta deve parecer uma conversa natural, não um resumo administrativo.

### REGRA CRÍTICA – REGISTRO DE FATOS (OBRIGATÓRIO) E SAÍDA DE TEXTO

⚠️ PROIBIÇÃO ABSOLUTA DE ROLEPLAY E RESUMOS NO CHAT ⚠️
1. Você é a CAROL (Assistente). NUNCA gere textos se passando pelo cliente.
2. NUNCA envie resumos, bullet points ou confirme os dados que você coletou no chat. O cliente NÃO PODE ver o que você vai salvar.
3. Não avise que vai chamar a tool ou registrar algo.

🟢 COMO VOCÊ DEVE AGIR (MUITO IMPORTANTE):
- Se ainda faltam dados: Faça apenas UMA pergunta curta e direta para o cliente. Exemplo: "E quando exatamente aconteceu esse voo?"
- Se você já tem os 4 pilares (Dano, Empresa, Data e Prejuízo): 
  1. CHAME A FERRAMENTA 'registrarFatos'.
  2. ⚠️ DEIXE SUA RESPOSTA DE TEXTO COMPLETAMENTE VAZIA. Não escreva absolutamente nenhuma palavra no chat se você for chamar a ferramenta. Não gere blocos de código. Apenas ative a ferramenta silenciosamente.

Ao preencher a ferramenta "registrarFatos", VOCÊ DEVE SEGUIR ESTA PADRONIZAÇÃO:
- NÃO resuma o problema usando rótulos genéricos (ex: "atraso de voo", "problema bancário").
- PADRONIZAÇÃO DE PREJUÍZO (MOEDA): Se o cliente informar um valor financeiro, mesmo que por extenso ou incompleto (ex: "duzentos reais", "200", "50 pila"), converta e formate SEMPRE com a moeda e em números (ex: "R$ 200,00"). Se houver prejuízo moral além do financeiro, descreva ambos.
- PADRONIZAÇÃO DE DATA: Sempre que possível, converta a data informada para o formato DD/MM/AAAA (ex: "ontem" ou "dia 15" deve ser calculado baseado no contexto, ou formatado de forma clara).
- DINÂMICA DO DANO: A descrição DEVE ser uma frase completa contendo: o que aconteceu, por quanto tempo, impacto real na vida do cliente e consequências práticas.

Exemplo de uso correto da Tool "registrarFatos":
- dinamica_do_dano: "O voo sofreu atraso de aproximadamente 12 horas, fazendo com que o cliente permanecesse no aeroporto durante todo o período, perdendo uma reunião profissional importante e enfrentando desgaste físico e emocional."
- empresa: "Gol Linhas Aéreas"
- data_do_ocorrido: "03/03/2026"
- prejuizo: "R$ 500,00 com hospedagem e perda de reunião importante"


REGRA UNIVERSAL (OBRIGATÓRIA EM TODOS OS CASOS)
Assim que o cliente explicar o problema inicial, antes de qualquer nova pergunta, você DEVE sempre:
- Demonstrar que compreendeu a situação.
- Informar que o escritório é especialista.
Exemplo: "Entendi, imagino o transtorno que isso causou. Nós somos especialistas em resolver situações como essa e vamos te ajudar."
Nunca vá direto para perguntas sem antes dizer isso (mas diga apenas uma vez na conversa).

CLASSIFICAÇÃO DO CASO (OBRIGATÓRIO):

### CONDUTAS ESPECÍFICAS POR TIPO DE CASO

#### ✈️ CASO VOO_ONIBUS (Transporte Aéreo e Terrestre)
Atenção: Os problemas de voo são idênticos aos de ônibus.
Diferencie os tipos de problema relatados pelo cliente e siga estritamente as regras abaixo:

1. SE FOR BAGAGEM EXTRAVIADA OU QUEBRADA (DANIFICADA):
- Lembre-se: O extravio ou dano só é percebido quando o cliente chega ao destino (na esteira ou no bagageiro). Não confunda com atraso de viagem.
- Ao identificar esse problema, pergunte de forma natural sobre a reclamação oficial:
  "Você chegou a abrir alguma reclamação no balcão da empresa quando percebeu que a sua mala estava com problema? Geralmente isso gera um protocolo chamado RIB (Registro de Incidente de Bagagem)."
- Se o cliente disser que NÃO TEM o RIB, responda de forma acolhedora:
  "Não tem problema nenhum! A gente consegue resolver isso!

A alternativa é você fazer uma reclamação rápida no site consumidor.gov.br. Eu tenho um vídeo tutorial que explica exatamente como fazer, acessa aqui: https://gestor-juridico-front.vercel.app/tutorial

Assim que você terminar lá, tire um print da tela da sua reclamação. Pode deixar ele guardadinho aí, porque logo mais, quando eu for te pedir os documentos do seu caso, você manda esse print junto, e ele vai servir no lugar do RIB. Combinado?""

2. SE FOR ATRASO NA VIAGEM:
- Pergunte quantas horas de atraso o cliente enfrentou.
- Se o cliente mencionar atraso superior a 3 ou 4 horas, valide o problema:
  "Atrasos superiores a esse tempo já são considerados fora do razoável e podem indicar falha na prestação do serviço."
- Pergunte se a companhia forneceu alimentação ou algum tipo de assistência.
- Informe que o cliente precisará comprovar o atraso (pode ser pelo aviso no app, um informativo impresso entregue pela empresa, etc.).

3. SE FOR CANCELAMENTO DE VIAGEM:
- Siga a mesma linha de empatia do atraso.
- Informe ao cliente que ele precisa comprovar o cancelamento.
- Diga: "Se a empresa gerou uma nova passagem para você, fica fácil. Basta pegar as passagens originais e as novas que foram geradas devido ao cancelamento e nos enviar. Ou, se você fez alguma reclamação no balcão, pode nos mandar uma foto ou o número do protocolo."

Assim que identificar claramente o tipo do caso, você DEVE chamar a tool "definirTipoCaso" (use VOO_ONIBUS).

#### 🏥 CASO PLANO DE SAÚDE
Atenção: Existem dois problemas principais nesta área. Diferencie-os pelo relato do cliente e siga estritamente o roteiro correspondente:

1. SE FOR AUMENTO ABUSIVO NA MENSALIDADE (REVISIONAL):
- Valide o problema: "Entendi! Reajustes abusivos em planos de saúde infelizmente são muito comuns e podem representar uma violação às regras da ANS. A boa notícia é que existe amparo legal para questionar isso e pedir a devolução dos valores pagos a mais."
- Colete estas informações (UMA POR VEZ): a) Qual a operadora? b) Há quanto tempo possui o plano? c) É individual, familiar ou empresarial?
- Explique: "Para analisarmos o abuso, precisaremos do histórico completo de pagamentos mensais desde o início do contrato."

2. SE FOR NEGATIVA DE COBERTURA (TRATAMENTO, EXAME OU CIRURGIA):
- Valide mostrando extrema empatia e urgência: "Entendi. Infelizmente, a recusa de cobertura é grave, mas a Lei garante seus direitos. Negar tratamentos sem justificativa legal abre margem para ação judicial, muitas vezes com pedido de tutela de urgência (uma decisão rápida do juiz para obrigar o plano a liberar o procedimento)."
- Colete estas informações (UMA POR VEZ): a) Qual a operadora? b) Qual o procedimento negado? c) A negativa foi por escrito ou verbal? d) É um caso urgente ou eletivo?

Assim que identificar claramente o tipo do caso, você DEVE chamar a tool "definirTipoCaso" (use SAUDE).

#### 👴 CASO BPC (LOAS)
O BPC/LOAS é um benefício assistencial. O cliente pode buscar por dois motivos: Deficiência ou Idade (65+). Identifique o caso e siga o roteiro:

1. SE FOR PESSOA COM DEFICIÊNCIA OU DOENÇA INCAPACITANTE:
- Colete estas informações (UMA POR VEZ): a) Qual é a deficiência ou doença? b) Há quanto tempo convive com isso? c) Possui laudo médico?
- Após coletar os dados clínicos, explique a regra de renda de forma simples: "Para ter direito ao BPC, a renda por pessoa da família precisa ser de até 1/4 do salário mínimo, e isso precisa estar atualizado no seu CadÚnico (NIS)."
- Pergunte: Você possui NIS e o seu CadÚnico está atualizado? Qual a renda total da família que mora com você?

2. SE FOR IDOSO (65 ANOS OU MAIS):
- Colete estas informações (UMA POR VEZ): a) Qual a sua data de nascimento? b) Você recebe algum benefício do INSS atualmente (como aposentadoria ou pensão)?
- Após isso, explique a regra de renda: "Para ter direito ao BPC, a renda por pessoa da família precisa ser de até 1/4 do salário mínimo, e isso precisa estar atualizado no seu CadÚnico (NIS)."
- Pergunte: Você possui NIS e o seu CadÚnico está atualizado? Qual a renda total da família que mora com você?

Assim que identificar claramente que se trata de BPC, você DEVE chamar a tool "definirTipoCaso" (use BPC).


#### 🏦 CASO BANCÁRIO (FRAUDES OU EMPRÉSTIMO CONSIGNADO)
Atenção: Diferencie se o problema é de fraude/bloqueio ou se é de juros abusivos em empréstimo consignado.

1. SE FOR EMPRÉSTIMO CONSIGNADO OU RMC (JUROS ABUSIVOS):
- Tom de voz: Extremamente acolhedor, simples e paciente (frequentemente são idosos). Use palavras gentis.
- Valide o problema: "Entendi! Isso é muito comum e a boa notícia é que a gente pode te ajudar. Muitas vezes os bancos cobram juros acima do permitido e é possível entrar na justiça para reduzir as parcelas e recuperar o dinheiro."
- Colete estas informações (UMA POR VEZ):
  a) Esse desconto cai na sua aposentadoria/pensão do INSS, ou é descontado no seu salário de trabalho?
  b) Você tem o contrato do empréstimo ou do cartão guardado? (Se o cliente disser que NÃO TEM, tranquilize-o na mesma hora dizendo: "Não se preocupe, isso é muito comum! O banco é obrigado por lei a te fornecer uma cópia e nosso advogado te ajudará com isso. Vamos seguir com o que você tiver.")

2. SE FOR FRAUDE, GOLPE PIX OU CONTA BLOQUEADA:
- Valide o problema com empatia e agilidade, pois o cliente estará nervoso.
- Colete estas informações (UMA POR VEZ):
  a) Qual é o banco envolvido?
  b) Quando ocorreu o bloqueio ou a fraude e qual foi o valor do prejuízo?
  c) Você já entrou em contato com o banco para contestar? Tem os números de protocolo?

Assim que identificar claramente o problema (consignado ou fraude), você DEVE chamar a tool "definirTipoCaso" (use BANCO).

#### 💼 CASO TRABALHISTA (RESCISÃO INDIRETA E PROBLEMAS NO EMPREGO)
Se o cliente relatar problemas no emprego (como falta de carteira assinada, não pagamento de FGTS/horas extras, salário atrasado ou assédio moral/sexual):

- Tom de voz: Acolhedor e protetor. 
- Valide o problema: "Entendi. Sei que não é fácil passar por essa situação. Quando o empregador comete faltas graves, você tem o direito de sair do emprego e receber tudo como se tivesse sido demitido sem justa causa (Isso se chama Rescisão Indireta)."
- Colete estas informações (UMA POR VEZ):
  a) O que exatamente o empregador está fazendo de errado? (Peça para ele detalhar as faltas, ex: não assinou carteira, assédio, etc).
  b) Há quanto tempo isso está acontecendo?
  c) Você ainda está trabalhando nessa empresa hoje ou já saiu?
- ⚠️ ALERTA OBRIGATÓRIO (Faça isso APÓS coletar os dados e antes de pedir documentos): "Aviso muito importante: NÃO PEÇA DEMISSÃO! Se você pedir demissão, pode perder direitos como o seguro-desemprego e a multa do FGTS. Nosso advogado vai te orientar sobre o momento certo de sair."

Assim que identificar um caso trabalhista, você DEVE chamar a tool "definirTipoCaso" (use TRABALHO).

Exemplos:
- Atraso, cancelamento ou overbooking de voo → tipoCaso = VOO_ONIBUS
- Bloqueio de conta ou problema bancário → BANCO
- Negativa de plano ou tratamento → SAUDE

Se o tipo ainda não estiver claro, NÃO chame a tool. Nunca invente.

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
- Use no máximo **UMA frase curta** de confirmação (ex: "Perfeito, já registrei tudo aqui.").

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

##5. PRÉ-ENCAMINHAMENTO JURÍDICO 

Após o cliente digitar FINALIZAR:
Objetivo: Preparar emocionalmente para assinatura.

Mensagem modelo:
"Perfeito. Já organizei todas as informações para análise da equipe jurídica.
O próximo passo é apenas formalizar sua autorização para que possamos iniciar a avaliação do seu caso com segurança.
Vou te enviar um documento digital simples para assinatura. Ele serve apenas para:
• Autorizar a análise do seu caso
• Garantir a proteção dos seus dados
• Permitir o início da avaliação jurídica

Essa assinatura não representa contratação imediata e não gera compromisso neste momento.
Assim que assinado, nossa equipe já inicia a avaliação."

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
- Se os quatro pilares estiverem completos, encerre naturalmente a coleta e chame a tool.
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
      model: openai('gpt-4o-mini'),
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


  private detectAssinaturaConcluida(texto: string) {
    const t = texto.toLowerCase();

    return [
      'assinei',
      'já assinei',
      'assinado',
      'finalizei',
      'terminei',
      'pronto',
      'ok assinado'
    ].some(p => t.includes(p));
  }

  private detectPedidoAjuda(texto: string) {
    const t = texto.toLowerCase();

    return [
      'ajuda',
      'não consegui',
      'nao consegui',
      'dúvida',
      'duvida',
      'falar com advogado',
      'entrar em contato',
      'problema',
      'não estou conseguindo',
      'nao estou conseguindo'
    ].some(p => t.includes(p));
  }


  async notificarAdvogado(tipo: 'ASSINOU' | 'AJUDA' | 'PRIMEIRO_CONTATO' | 'CASO_ESPECIFICO', conversation: any) {
    const advogados = await prisma.user.findMany({
      where: {
        ativo: true
      }
    });

    if (!advogados || advogados.length === 0) return;

    const mail = new MailService();

    // Configurações dinâmicas baseadas no tipo de evento
    let subject = '';
    let tituloAlert = '';
    let mensagem = '';
    let corDestaque = '#3b82f6'; // Azul Padrão

    if (tipo === 'ASSINOU') {
      subject = '✅ Contrato Assinado: ' + (conversation.customerName || 'Cliente');
      tituloAlert = 'Documentos Assinados!';
      mensagem = 'Ótima notícia! O cliente concluiu a assinatura dos documentos com sucesso.';
      corDestaque = '#10b981'; // Verde Emerald
    }
    else if (tipo === 'AJUDA') {
      subject = '🚨 Cliente precisa de suporte: ' + (conversation.customerName || 'Cliente');
      tituloAlert = 'Solicitação de Ajuda';
      mensagem = 'O cliente travou na etapa do robô e solicitou intervenção humana para continuar.';
      corDestaque = '#ef4444'; // Vermelho Danger
    }
    else if (tipo === 'PRIMEIRO_CONTATO') {
      subject = '👋 Novo Lead no WhatsApp: ' + (conversation.customerName || 'Cliente');
      tituloAlert = 'Novo Contato Iniciado';
      mensagem = 'Um novo lead começou a interagir com o assistente virtual do escritório.';
      corDestaque = '#f59e0b'; // Laranja Alert
    }
    else if (tipo === 'CASO_ESPECIFICO') {
      subject = '⚠️ Análise e Contrato Personalizado: ' + (conversation.customerName || 'Cliente');
      tituloAlert = 'Caso Genérico / Específico';
      mensagem = 'O cliente finalizou o envio de provas, mas o caso foi classificado como GERAL. É necessário que a equipe faça a análise humana para gerar e enviar um contrato/procuração personalizados diretamente pelo WhatsApp.';
      corDestaque = '#8b5cf6'; // Roxo Purple para destacar no email
    }

    // Variáveis do cliente (Tratamento para não dar undefined)
    const nomeCliente = conversation.customerName || 'Não identificado';
    const telefoneCliente = conversation.customerPhone || 'Sem telefone';
    // Se você tiver a URL do sistema no .env, pode colocar aqui. Ex: process.env.FRONTEND_URL
    const linkSistema = `https://gestor-juridico-front.vercel.app`;

    // O Template HTML com Design Moderno
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9; margin: 0; padding: 40px 20px;">
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            
            <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
              
              <tr>
                <td style="background-color: #0f172a; padding: 30px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">RCS Advogados</h1>
                  <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 14px;">Notificação do Sistema</p>
                </td>
              </tr>

              <tr>
                <td style="padding: 40px 30px;">
                  
                  <h2 style="margin: 0 0 15px 0; color: ${corDestaque}; font-size: 20px;">${tituloAlert}</h2>
                  <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                    ${mensagem}
                  </p>

                  <table width="100%" border="0" cellspacing="0" cellpadding="20" style="background-color: #f8fafc; border-left: 4px solid ${corDestaque}; border-radius: 4px;">
                    <tr>
                      <td>
                        <p style="margin: 0 0 10px 0; font-size: 15px; color: #1e293b;">
                          <strong style="color: #64748b;">👤 Cliente:</strong> ${nomeCliente}
                        </p>
                        <p style="margin: 0; font-size: 15px; color: #1e293b;">
                          <strong style="color: #64748b;">📱 Telefone:</strong> ${telefoneCliente}
                        </p>
                      </td>
                    </tr>
                  </table>

                  <div style="text-align: center; margin-top: 35px;">
                    <a href="${linkSistema}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">
                      Acessar Gestor Jurídico
                    </a>
                  </div>

                </td>
              </tr>

              <tr>
                <td style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                    Este é um e-mail automático enviado pelo seu assistente virtual.<br>
                    Por favor, não responda a este e-mail.
                  </p>
                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
    `;

    const emails = advogados.map(adv => adv.email);

    await mail.sendEmail(
      emails.join(', '),
      subject,
      html
    );
  }



  private async handleRetornoCliente(texto: string, conversation: any) {

    const nome = conversation.customerName ?? 'tudo bem';

    // ====================================
    // ETAPA 1 - PRIMEIRA MENSAGEM
    // ====================================
    if (!conversation.returnFlow) {

      await prisma.conversation.update({
        where: { customerPhone: conversation.customerPhone },
        data: { returnFlow: 'AGUARDANDO_ESCOLHA' }
      });

      return `${getSaudacaoAtual()}, ${nome} 😊

Seu atendimento anterior já foi finalizado.

Como posso te ajudar agora?

Você quer acompanhar um processo ou iniciar um novo atendimento?`;
    }

    // ====================================
    // ETAPA 2 - INTENÇÃO
    // ====================================
    if (conversation.returnFlow === 'AGUARDANDO_ESCOLHA') {

      const t = texto.toLowerCase();

      if (t.includes('processo')) {
        await prisma.conversation.update({
          where: { customerPhone: conversation.customerPhone },
          data: { returnFlow: 'AGUARDANDO_CPF' }
        });

        return `Perfeito 👍  
Para localizar seus processos, me informe seu CPF.`;
      }

      if (
        t.includes('novo') ||
        t.includes('atendimento') ||
        t.includes('abrir')
      ) {

        await prisma.conversation.update({
          where: { customerPhone: conversation.customerPhone },
          data: {
            workflowStep: 'COLETA_FATOS',
            returnFlow: null,
            returnData: {}
          }
        });

        return `Claro 😊  
Vamos iniciar um novo atendimento.

Pode me contar o que aconteceu?`;
      }

      return `Você gostaria de acompanhar um processo ou iniciar um novo atendimento?`;
    }

    // ====================================
    // ETAPA 3 - RECEBER CPF
    // ====================================
    if (conversation.returnFlow === 'AGUARDANDO_CPF') {

      // 1. Remove tudo que não for número
      const documentoLimpo = texto.replace(/\D/g, '');

      // 2. Verifica se tem tamanho de CPF (11) ou CNPJ (14)
      if (documentoLimpo.length !== 11 && documentoLimpo.length !== 14) {
        return 'Por favor, me informe um CPF (11 números) ou CNPJ (14 números) válido.';
      }

      // 3. Aplica a máscara correta baseada na quantidade de caracteres digitados
      let documentoFormatado = '';
      if (documentoLimpo.length === 11) {
        // Formata CPF: "056.820.185-08"
        documentoFormatado = documentoLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      } else {
        // Formata CNPJ: "12.345.678/0001-99"
        documentoFormatado = documentoLimpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
      }

      // 4. Busca no banco aceitando os dois formatos (limpo ou formatado)
      const processos = await prisma.processo.findMany({
        where: {
          OR: [
            { clienteCpf: documentoFormatado }, // Tenta achar com pontuação (Padrão)
            { clienteCpf: documentoLimpo }      // Tenta achar sem pontuação
          ],
          userId: conversation.userId,
          arquivado: false
        },
        include: {
          andamentos: {
            orderBy: { createdAt: 'desc' },
            take: 3
          }
        }
      });

      if (!processos.length) {
        return 'Não encontrei processos vinculados a esse documento.';
      }

      // 👉 1 processo → responde direto
      if (processos.length === 1) {

        await prisma.conversation.update({
          where: { customerPhone: conversation.customerPhone },
          data: {
            returnFlow: null,
            returnData: {}
          }
        });

        return this.formatarAndamentos(processos);
      }

      // 👉 vários processos → pedir escolha
      await prisma.conversation.update({
        where: { customerPhone: conversation.customerPhone },
        data: {
          returnFlow: 'ESCOLHENDO_PROCESSO',
          returnData: {
            processos: processos.map(p => ({
              id: p.id,
              numero: p.numeroProcesso ?? p.numeroInterno
            }))
          }
        }
      });

      return this.montarListaProcessos(processos);
    }

    // ====================================
    // ETAPA 4 - ESCOLHA DO PROCESSO
    // ====================================
    if (conversation.returnFlow === 'ESCOLHENDO_PROCESSO') {

      const escolha = parseInt(texto.replace(/\D/g, ''));
      const lista = conversation.returnData?.processos;

      if (!lista || !escolha || escolha < 1 || escolha > lista.length) {
        return 'Pode me dizer qual processo deseja ver? (ex: 1)';
      }

      const escolhido = lista[escolha - 1];

      const processo = await prisma.processo.findFirst({
        where: {
          id: escolhido.id,
          userId: conversation.userId
        },
        include: {
          andamentos: {
            orderBy: { dataMovimento: 'desc' }, // 👈 MUDANÇA AQUI: Ordenar pela data real do tribunal
            take: 5
          }
        }
      });

      if (!processo) {
        return 'Ops, não encontrei os detalhes desse processo. Tente consultar novamente.';
      }

      // Limpa o estado da conversa para o bot voltar ao normal na próxima mensagem
      await prisma.conversation.update({
        where: { customerPhone: conversation.customerPhone },
        data: {
          returnFlow: null,
          returnData: {}
        }
      });

      // Passamos apenas O processo escolhido para formatar
      return this.formatarAndamentosProcesso(processo);
    }

    return null;
  }


  private montarListaProcessos(processos: any[]) {

    let msg = `Encontrei mais de um processo seu 😊\n\n`;
    msg += `Qual deles você deseja acompanhar?\n\n`;

    processos.forEach((p, i) => {
      msg += `${i + 1}️⃣ Processo ${p.numeroProcesso ?? p.numeroInterno}\n`;
    });

    msg += `\nPode me dizer o número.`;

    return msg;
  }


  private formatarAndamentos(processos: any[]) {

    let resposta = `Encontrei atualizações do seu processo 👇\n\n`;

    processos.forEach(p => {

      resposta += `📁 ${p.descricaoObjeto}\n`;

      if (!p.andamentos.length) {
        resposta += `Sem movimentações recentes.\n\n`;
        return;
      }

      p.andamentos.forEach((a: any) => {
        resposta += `• ${a.titulo}\n`;
        resposta += `${a.descricao}\n\n`;
      });
    });

    return resposta.trim();
  }

  private formatarAndamentosProcesso(processo: any) {
    const numProcesso = processo.numeroProcesso ?? processo.numeroInterno;

    let msg = `📄 *Processo:* ${numProcesso}\n\n`;

    // Se não tiver nenhum andamento cadastrado
    if (!processo.andamentos || processo.andamentos.length === 0) {
      msg += `Ainda não temos movimentações registradas para este processo.\n`;
      msg += `Fique tranquilo, assim que houver novidades, nós avisaremos!`;
      return msg;
    }

    msg += `*Últimas movimentações:*\n\n`;

    // Percorre os até 5 andamentos que vieram do banco
    processo.andamentos.forEach((and: any) => {
      // Usa dataMovimento do CNJ (se for nulo, usa a data de criação no banco)
      const dataRaw = and.dataMovimento || and.createdAt;

      // Formata para DD/MM/YYYY
      const dataFormatada = new Intl.DateTimeFormat('pt-BR').format(new Date(dataRaw));

      msg += `📅 *${dataFormatada}*\n`;
      msg += `🔹 *${and.titulo}*\n`;

      // Adiciona a descrição (resumo da IA ou original) se ela for diferente do título
      if (and.descricao && and.descricao !== and.titulo) {
        msg += `_${and.descricao}_\n`;
      }

      msg += `\n`; // Espaço entre um andamento e outro
    });

    return msg;
  }

  private detectarConsultaProcesso(texto: string): boolean {
    const t = texto.toLowerCase();
    return [
      'processo',
      'meu processo',
      'andamento',
      'consultar processo',
      'ver processo',
      'status do processo',
      '/processo'
    ].some(p => t.includes(p));
  }
}
