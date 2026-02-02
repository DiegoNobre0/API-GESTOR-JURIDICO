import { z } from 'zod';

export const createCompromissoSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  startDate: z.string(), // ISO String
  endDate: z.string(),
  location: z.string().optional(),
  type: z.enum(['audiencia', 'reuniao', 'prazo', 'outro']).default('reuniao'),
});

export const createTarefaSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  deadline: z.string().optional(),
  processoId: z.string().optional(), // Vinculação opcional com processo
  prioridade: z.enum(['baixa', 'media', 'alta']).default('media'),
});

export type CreateCompromissoInput = z.infer<typeof createCompromissoSchema>;
export type CreateTarefaInput = z.infer<typeof createTarefaSchema>;