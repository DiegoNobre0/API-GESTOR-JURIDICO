import { z } from 'zod';

// Enums extraídos da sua lógica de negócio atual
export const ResponsavelEnum = z.enum(['Leonardo', 'Alberto', 'Jenifer']);
export const StatusGeralEnum = z.enum([
  'Contrato Fechado', 
  'Em Andamento', 
  'Em Negociação/Acordo', 
  'Finalizado com Êxito', 
  'Finalizado sem Êxito'
]);

export const createProcessoSchema = z.object({
  clienteNome: z.string().min(3, "Nome do cliente é obrigatório"),
  descricaoObjeto: z.string(),
  numeroInterno: z.string().optional(),
  dataFechamentoContrato: z.string(), // ISO Date ou formato DD/MM/YYYY
  numeroProcesso: z.string().optional(),
  responsavel: ResponsavelEnum,
  tipoHonorarios: z.enum(['Iniciais', 'Êxito', 'Ambos']),
  valorPrevistoIniciais: z.number().default(0),
  valorPrevistoExito: z.number().default(0),
  basePrevisao: z.string().optional(),
  dataEstimadaRecebimento: z.string().optional(),
  custosPrevistos: z.number().default(0),
  statusProtocolamento: z.string().default("Pendente de Protocolamento"),
  statusGeral: StatusGeralEnum.default("Contrato Fechado"),
  clienteCpf: z.string().optional(),
  clienteEmail: z.string().email().optional(),
});

// Inferência de tipo para uso nos Use Cases
export type CreateProcessoInput = z.infer<typeof createProcessoSchema>;