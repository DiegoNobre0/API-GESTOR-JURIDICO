import { z } from 'zod';

export const createFinanceiroSchema = z.object({
  tipo: z.enum(['entrada', 'saida']), 
  categoria: z.string(), 
  valor: z.number().positive(),
  data: z.coerce.date(), 
  descricao: z.string().min(3),
  processoId: z.string().optional().nullable(), 
  recorrente: z.boolean().default(false),
  // 👇 ADICIONADO: Pega a quantidade de meses (padrão é 1)
  meses_recorrencia: z.number().optional().default(1) 
});

export type CreateFinanceiroInput = z.infer<typeof createFinanceiroSchema>;