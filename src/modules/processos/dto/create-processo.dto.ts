// backend/src/modules/processos/dto/create-processo.dto.ts
import { z } from 'zod';

export const createProcessoSchema = z.object({
  // --- DADOS DO CLIENTE ---
  clienteNome: z.string().min(3, "Nome do cliente é obrigatório"),

  // NOVO: Telefone é obrigatório para fazer o vínculo/criação do cliente
  clienteTelefone: z.string().min(8, "Telefone é obrigatório"),

  // CPF e Email continuam opcionais com preprocessamento
  clienteEmail: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().email("E-mail inválido").optional().nullable()
  ),
  clienteCpf: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().optional().nullable()
  ),

  // --- DADOS DO PROCESSO ---
  descricaoObjeto: z.string(),
  numeroInterno: z.string().optional(),

  numeroProcesso: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().optional().nullable()
  ),

  responsavel: z.enum(['Leonardo', 'Alberto', 'Jenifer']),
  tipoHonorarios: z.enum(['Iniciais', 'Êxito', 'Ambos']),
  valorPrevistoIniciais: z.number().default(0),
  valorPrevistoExito: z.number().default(0),
  basePrevisao: z.string().optional().nullable(),
  dataEstimadaRecebimento: z.preprocess(
    (val) => (val === '' ? null : val), // Trata string vazia como null
    z.coerce.date().optional().nullable() // Aceita string ISO e vira Date
  ),
  custosPrevistos: z.number().default(0),
  dataFechamentoContrato: z.coerce.date(), // Aceita string ISO

  statusProtocolamento: z.string().default("Pendente de Protocolamento"),
  statusGeral: z.string().default("Contrato Fechado"),

  gerarDocumentosZapSign: z.boolean().optional(),
  conversationId: z.string().optional().nullable(),

  // --- NOVO: ARQUIVOS ---
  arquivos: z.array(z.object({
    tipo: z.string(),
    url: z.string(),
    nomeArquivo: z.string()
  })).optional().default([])
});

export type CreateProcessoInput = z.infer<typeof createProcessoSchema>;