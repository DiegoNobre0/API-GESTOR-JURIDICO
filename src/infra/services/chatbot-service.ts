import { generateText } from 'ai';
import { groq } from '@ai-sdk/groq';
import { z } from 'zod';
import type { FinanceiroService } from '@/modules/financeiro/financeiro.service.js';


const financeiroSchema = z.object({
  valor: z.number(),
  tipo: z.enum(['entrada', 'saida']),
  categoria: z.string(),
  descricao: z.string(),
  // O .coerce.date() resolve o erro ts(2345) transformando string em Date
  data: z.coerce.date(), 
  recorrente: z.boolean().default(false),
  processoId: z.string().optional(),
});
export class ChatbotService {
  constructor(
    private financeiroService: FinanceiroService // Nomeclatura atualizada
  ) {}

  async chat(message: string, userId: string) {
    const result = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      system:
        'Você é um assistente da RCS Advogados. Para lançamentos financeiros, use a ferramenta criarFinanceiro.', // Contexto RCS
      prompt: message,

      // Mantendo o seu workaround oficial que já funciona
      tools: {
        criarFinanceiro: { // Nomeclatura atualizada
          description: 'Registra um lançamento financeiro no sistema',
          inputSchema: financeiroSchema,
        },
      } as any,
    });

    if (result.toolCalls?.length) {
      for (const call of result.toolCalls) {
        if (call.toolName === 'criarFinanceiro') {
          // Validação com o novo Schema
          const input = financeiroSchema.parse(call.input);

          // Chamada para o método create do seu FinanceiroService
          const registro = await this.financeiroService.create(
            input,
            userId
          );

          return `✅ Lançamento registrado com sucesso na RCS Advogados!

💰 Valor: R$ ${input.valor.toFixed(2)}
📂 Categoria: ${input.categoria}
🗓 Data: ${input.data}
🆔 ID: ${registro.id}`;
        }
      }
    }

    return result.text;
  }
}