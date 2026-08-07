import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

export class EmailAndamentosService {

  /**
   * Recebe o texto bruto do e-mail (ou HTML limpo) enviado pelo software parceiro/tribunal
   */
  async processarEmailMovimentacao(conteudoEmail: string, remetente: string) {
    // 1. IA extrai os dados estruturados do e-mail
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      temperature: 0,
      schema: z.object({
        identificadorProcesso: z.string().describe(
          'Número CNJ ou número interno do processo mencionado no e-mail. Extraia apenas números ou formato padrão.'
        ),
        titulo: z.string().describe(
          'Título curto da movimentação (ex: Publicação de Despacho, Juntada de Petição, Certidão Emitida)'
        ),
        descricao: z.string().describe(
          'Texto completo e detalhado do andamento ou intimação constante no e-mail'
        ),
        dataMovimento: z.string().optional().describe(
          'Data do andamento no formato AAAA-MM-DD. Se não houver, deixe nulo.'
        ),
      }),
      system: `Você é um extrator de dados jurídicos. Analise o e-mail recebido e identifique a qual processo se refere e qual foi a movimentação processual.`,
      prompt: `CONTEÚDO DO E-MAIL:\n${conteudoEmail}`,
    });

    if (!object.identificadorProcesso) {
      console.warn('[EMAIL INGESTION] Nenhum número de processo identificado no e-mail.');
      return null;
    }

    // 2. Limpa pontuação para busca flexível (CNJ com ou sem pontos)
    const numLimpo = object.identificadorProcesso.replace(/\D/g, '');

    // 3. Busca o processo no banco do usuário/escritório
    const processo = await prisma.processo.findFirst({
      where: {
        OR: [
          { numeroProcesso: object.identificadorProcesso },
          { numeroCNJ: object.identificadorProcesso },
          { numeroProcesso: { contains: numLimpo } },
          { numeroInterno: object.identificadorProcesso }
        ],
        arquivado: false
      }
    });

    if (!processo) {
      console.warn(`[EMAIL INGESTION] Processo não encontrado no sistema: ${object.identificadorProcesso}`);
      return null;
    }

    // 4. Cria o Andamento vinculado ao Processo
    const novoAndamento = await prisma.andamento.create({
      data: {
        processoId: processo.id,
        titulo: object.titulo,
        descricao: object.descricao,
        autorNome: 'Integração E-mail (Automático)',
        dataMovimento: object.dataMovimento ? new Date(object.dataMovimento) : new Date(),
        createdBy: processo.userId
      }
    });

    return {
      houveNovidade: true,
      andamento: novoAndamento,
      processoNome: processo.clienteNome,
      numero: processo.numeroProcesso
    };
  }
}