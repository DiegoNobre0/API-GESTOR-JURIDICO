import { tool } from 'ai';
import { z } from 'zod';

export const tipoCasoEnum = z.enum([
  'VOO_ONIBUS', 'BANCO', 'SAUDE', 'TRABALHO', 'GERAL', 'BPC', 'INSS', 'GOV',
]);

export const registrarFatosSchema = z.object({
  dinamica_do_dano: z
    .string()
    .min(5, 'Descreva o ocorrido com mais detalhes')
    .describe(
      'Descrição detalhada do que aconteceu, incluindo contexto, duração, transtornos e consequências práticas'
    ),
  empresa: z
    .string()
    .min(2)
    .refine(
      val => !/não informad|não sei/i.test(val),
      'VOCÊ PRECISA PERGUNTAR A EMPRESA. Não envie placeholders.'
    )
    .describe('Nome da empresa responsável pelo ocorrido'),
  data_do_ocorrido: z
    .string()
    .min(4)
    .refine(
      val => !/não informad|não sei|não mencionad/i.test(val),
      'VOCÊ PRECISA PERGUNTAR A DATA. Não envie placeholders.'
    )
    .describe('Data ou período aproximado do ocorrido. OBRIGATÓRIO PERGUNTAR.'),
  prejuizo: z
    .string()
    .min(1)
    .refine(
      val => !/não informad|não sei/i.test(val),
      'VOCÊ PRECISA PERGUNTAR O PREJUÍZO. Não envie placeholders.'
    )
    .describe('Descrição dos prejuízos financeiros, profissionais ou pessoais sofridos'),
});

export const definirTipoCasoSchema = z.object({
  tipoCaso: tipoCasoEnum.describe(
    'Classificação principal do caso jurídico com base no relato do cliente'
  ),
});

export const atualizarEtapaTool = tool<{}, void>({
  description: 'Avança o workflow para a próxima etapa lógica',
  inputSchema: z.object({}),
  execute: async () => {},
});

export const registrarFatosTool = tool({
  description: 'Registra fatos jurídicos narrados pelo cliente',
  inputSchema: registrarFatosSchema,
  execute: async () => {},
});

export const definirTipoCasoTool = tool({
  description: 'Define o tipo principal do caso jurídico',
  inputSchema: definirTipoCasoSchema,
  execute: async () => {},
});

export const chatTools = {
  atualizarEtapa: atualizarEtapaTool,
  registrarFatos: registrarFatosTool,
  definirTipoCaso: definirTipoCasoTool,
} as const;
