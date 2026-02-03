import { z } from 'zod';

// Alterado de loginDTO para loginSchema para bater com o Controller
export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(6, "A senha deve ter no mínimo 6 caracteres")
});

export type LoginInput = z.infer<typeof loginSchema>;