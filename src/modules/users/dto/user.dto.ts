import { z } from 'zod';

export const userCreateSchema = z.object({
  nome: z.string().min(3, "Nome muito curto"),
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
  tipo: z.enum(['advogado_admin', 'advogado', 'cliente']).default('cliente'),
  numeroOab: z.string().optional(),
  estadoOab: z.string().optional(),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
  ativo: z.boolean().default(true)
});

// Novo Schema para o usuário editar as próprias configurações
export const userUpdateSettingsSchema = z.object({
  nome: z.string().optional(),
  numeroOab: z.string().optional(),
  estadoOab: z.string().optional(),
  notificarAgenda: z.boolean().optional(),
  notificarPje: z.boolean().optional(),
  horarioNotificacao: z.string().optional()
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateSettingsInput = z.infer<typeof userUpdateSettingsSchema>;