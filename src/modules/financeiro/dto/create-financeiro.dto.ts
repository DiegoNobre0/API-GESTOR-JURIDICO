import { z } from 'zod';

export const createFinanceiroSchema = z.object({
  tipo: z.enum(['entrada', 'saida']),
  categoria: z.string(), 
  valor: z.number().positive("O valor deve ser maior que zero"),
  data: z.coerce.date(), 
  descricao: z.string().min(3, "A descrição deve ter ao menos 3 caracteres"),
  processoId: z.string().optional(), // Removido .uuid() para aceitar o ObjectId do MongoDB
  recorrente: z.boolean().default(false)
});

export type CreateFinanceiroInput = z.infer<typeof createFinanceiroSchema>;