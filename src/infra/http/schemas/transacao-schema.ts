import { z } from 'zod';

export const createTransacaoSchema = z.object({
  tipo: z.enum(['entrada', 'saida']),
  categoria: z.string(), // Ex: "Honorários Iniciais", "Custos Processuais"
  valor: z.number().positive(),
  data: z.string(), // YYYY-MM-DD
  descricao: z.string(),
  processoId: z.string().optional(), // Vinculação opcional
  recorrente: z.boolean().default(false)
});

export type CreateTransacaoInput = z.infer<typeof createTransacaoSchema>;