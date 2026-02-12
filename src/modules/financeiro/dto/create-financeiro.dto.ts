import { z } from 'zod';

export const createFinanceiroSchema = z.object({
  // MUDANÇA AQUI: Padronizado para minúsculo
  tipo: z.enum(['entrada', 'saida']), 
  
  categoria: z.string(), 
  valor: z.number().positive(),
  data: z.coerce.date(), 
  descricao: z.string().min(3),
  
  // Aceita string (ID do Mongo), null ou undefined
  processoId: z.string().optional().nullable(), 
  
  // Garante que o campo exista no objeto final 'data'
  recorrente: z.boolean().default(false) 
});

export type CreateFinanceiroInput = z.infer<typeof createFinanceiroSchema>;