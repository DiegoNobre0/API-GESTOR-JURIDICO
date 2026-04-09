import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { ClassificacaoResult, TipoCaso } from './types.js';
import { CHECKLISTS } from './constants.js';

export function getSaudacaoAtual(): string {
  const horas = new Date().getHours();
  if (horas < 12) return 'Bom dia';
  if (horas < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function assertConversation(
  conversation: any,
): asserts conversation is NonNullable<typeof conversation> {
  if (!conversation) {
    throw new Error('Conversa não encontrada');
  }
}

export function cleanAIResponse(text: string): string {
  return text
    .replace(/<function=[\s\S]*?<\/function>/g, '')
    .replace(/<tool_code>[\s\S]*?<\/tool_code>/g, '')
    .trim();
}

export async function classificarTipoCasoPorFatos(fatos: {
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
        qualificacaoLead: z.enum(['QUENTE', 'MORNO', 'FRIO']),
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
      prompt: `FATOS RELATADOS:\n${JSON.stringify(fatos)}`,
    });

    return object;
  } catch (error) {
    console.error('❌ Erro na classificação IA:', error);
    return { tipoCaso: 'GERAL', qualificacaoLead: 'MORNO' };
  }
}

export function gerarMensagemDocsExtras(tipoCaso: TipoCaso): string {
  const checklist = CHECKLISTS[tipoCaso] ?? [];

  if (!checklist.length) {
    return `
Perfeito, agora você pode enviar qualquer outra prova que considere importante.

Pode ser foto, vídeo, áudio, PDF ou print.
Quando terminar, é só digitar *FINALIZAR*.
`.trim();
  }

  const itens = checklist.map(doc => `• ${doc.descricao}`).join('\n');

  return `
Perfeito, agora você pode enviar *outras provas* para reforçar seu caso.

Costuma ajudar bastante:
${itens}

Pode enviar fotos, PDFs, áudios ou vídeos.
Quando terminar, é só digitar *FINALIZAR*.
`.trim();
}
