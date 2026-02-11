// backend/src/modules/processos/dto/create-processo.dto.ts
import { z } from 'zod';

export const createProcessoSchema = z.object({
  clienteNome: z.string().min(3, "Nome do cliente é obrigatório"),
  descricaoObjeto: z.string(),
  
  // CORREÇÃO: Preprocessamento para transformar string vazia em undefined antes de validar
  clienteEmail: z.preprocess(
    (val) => (val === '' ? undefined : val), 
    z.string().email("E-mail inválido").optional()
  ),

  // O mesmo vale para o CPF se quiser evitar erro de formato
  clienteCpf: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().optional()
  ),

  numeroInterno: z.string().optional(),
  dataFechamentoContrato: z.coerce.date(),
  
  // Tratamento para numeroProcesso também
  numeroProcesso: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().optional()
  ),

  responsavel: z.enum(['Leonardo', 'Alberto', 'Jenifer']),
  tipoHonorarios: z.enum(['Iniciais', 'Êxito', 'Ambos']),
  valorPrevistoIniciais: z.number().default(0),
  valorPrevistoExito: z.number().default(0),
  basePrevisao: z.string().optional(),
  dataEstimadaRecebimento: z.string().optional(),
  custosPrevistos: z.number().default(0),
  statusProtocolamento: z.string().default("Pendente de Protocolamento"),
  statusGeral: z.string().default("Contrato Fechado"),
});

export type CreateProcessoInput = z.infer<typeof createProcessoSchema>;