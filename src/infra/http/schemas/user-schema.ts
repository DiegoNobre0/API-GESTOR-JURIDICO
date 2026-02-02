import { z } from 'zod';

export const userCreateSchema = z.object({
  nome: z.string().min(3, "Nome muito curto"),
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
  tipo: z.enum(['advogado_admin', 'advogado', 'cliente']).default('cliente'), //
  cpf: z.string().optional(),
  telefone: z.string().optional()
});

// Aqui nasce o UserCreateInput que estava faltando!
export type UserCreateInput = z.infer<typeof userCreateSchema>;