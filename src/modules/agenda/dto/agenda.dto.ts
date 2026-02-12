import { z } from "zod";

// Schema para criação de Compromissos (Audiências, Reuniões, etc)
export const createCompromissoSchema = z.object({
  title: z.string().min(3, "O título deve ter no mínimo 3 caracteres"),
  description: z.string().optional(),
  // Coerce converte a string do JSON em objeto Date automaticamente
  startDate: z.coerce.date({
    required_error: "A data de início é obrigatória",
    invalid_type_error: "Formato de data inválido",
  }),
  endDate: z.coerce.date({
    required_error: "A data de término é obrigatória",
  }),
  location: z.string().optional(),
  type: z.enum(['audiencia', 'reuniao', 'prazo', 'outro']).default('reuniao'),
});

// Schema para criação de Tarefas (Checklist do Dr. Diego)
export const createTarefaSchema = z.object({
  titulo: z.string().min(3),
  description: z.string(),
  responsavel: z.string(), // Texto (quem vai executar)
  prazo: z.string(),       // String (conforme seu modelo)
  processoId: z.string().optional().nullable(),
});

// Inferência de Tipos para uso no Service e Controller
export type CreateCompromissoInput = z.infer<typeof createCompromissoSchema>;
export type CreateTarefaInput = z.infer<typeof createTarefaSchema>;