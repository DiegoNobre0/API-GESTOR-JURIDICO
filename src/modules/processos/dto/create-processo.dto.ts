import { z } from 'zod';

export const createProcessoSchema = z.object({
  clienteNome: z.string().min(3, "Nome do cliente é obrigatório"),
  descricaoObjeto: z.string(),
  numeroInterno: z.string().optional(),
  dataFechamentoContrato: z.coerce.date(),
  numeroProcesso: z.string().optional(),
  responsavel: z.enum(['Leonardo', 'Alberto', 'Jenifer']),
  tipoHonorarios: z.enum(['Iniciais', 'Êxito', 'Ambos']),
  valorPrevistoIniciais: z.number().default(0),
  valorPrevistoExito: z.number().default(0),
  basePrevisao: z.string().optional(),
  dataEstimadaRecebimento: z.string().optional(),
  custosPrevistos: z.number().default(0),
  statusProtocolamento: z.string().default("Pendente de Protocolamento"),
  statusGeral: z.string().default("Contrato Fechado"),
  clienteCpf: z.string().optional(),
  clienteEmail: z.string().email().optional().or(z.literal('')),
});

export type CreateProcessoInput = z.infer<typeof createProcessoSchema>;