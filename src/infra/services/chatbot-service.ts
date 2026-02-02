import { generateText } from 'ai';
import { groq } from '@ai-sdk/groq';
import { z } from 'zod';
import { RegisterTransacaoUseCase } from '../../core/use-cases/register-transacao';

const transacaoSchema = z.object({
  valor: z.number(),
  tipo: z.enum(['entrada', 'saida']),
  categoria: z.string(),
  descricao: z.string(),
  data: z.string(),
  recorrente: z.boolean().default(false),
  processoId: z.string().optional(),
});

export class ChatbotService {
  constructor(
    private registerTransacao: RegisterTransacaoUseCase
  ) {}

  async chat(message: string, userId: string) {
    const result = await generateText({
      model: groq('llama-3.1-70b-versatile'),
      system:
        'Você é um assistente jurídico-financeiro. Para lançamentos, use a ferramenta criarTransacao.',
      prompt: message,

      // ⚠️ workaround oficial
      tools: {
        criarTransacao: {
          description: 'Registra um lançamento financeiro no sistema',
          inputSchema: transacaoSchema,
        },
      } as any,
    });

    if (result.toolCalls?.length) {
      for (const call of result.toolCalls) {
        if (call.toolName === 'criarTransacao') {
          // ✅ segurança REAL aqui
          const input = transacaoSchema.parse(call.input);

          const transacao = await this.registerTransacao.execute(
            input,
            userId
          );

          return `✅ Lançamento registrado com sucesso!

💰 Valor: R$ ${input.valor}
📂 Categoria: ${input.categoria}
🗓 Data: ${input.data}
🆔 ID: ${transacao.id}`;
        }
      }
    }

    return result.text;
  }
}
