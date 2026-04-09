import type { WorkflowStep, TipoCaso, DocumentoChecklist } from './types.js';

export const PROXIMA_ETAPA_POR_FLUXO: Record<WorkflowStep, WorkflowStep | null> = {
  COLETA_FATOS: 'COLETA_DOCS',
  COLETA_DOCS: 'COLETA_DOCS_EXTRA',
  COLETA_DOCS_EXTRA: 'ASSINATURA',
  ASSINATURA: 'FINALIZADO',
  FINALIZADO: null,
};

export const DOCUMENTOS_BASE: DocumentoChecklist[] = [
  { codigo: 'RG', descricao: 'RG ou CNH (Frente e Verso ou inteiro)' },
  { codigo: 'COMP_RES', descricao: 'Comprovante de residência' },
];

export const CHECKLISTS: Record<TipoCaso, DocumentoChecklist[]> = {
  VOO_ONIBUS: [
    { codigo: 'PASSAGEM', descricao: 'Passagens originais e as novas (se houver)' },
    { codigo: 'ATRASO', descricao: 'Comprovante do atraso ou cancelamento' },
    { codigo: 'GASTOS', descricao: 'Comprovantes de gastos extras (alimentação, hotel, etc)' },
    { codigo: 'RIB', descricao: 'RIB (Registro de Incidente de Bagagem) - Se for extravio/dano' },
    { codigo: 'OBS', descricao: 'Se ainda não fez reclamação, registre no *consumidor.gov.br* e nos envie o print. Nosso tutorial *gestor-juridico-front.vercel.app/tutorial*' },
  ],
  BANCO: [
    { codigo: 'EXTRATO', descricao: 'Extratos bancários detalhados' },
    { codigo: 'BLOQUEIO', descricao: 'Print da mensagem do banco ou chat avisando do bloqueio/fraude. Se não tiver, tire um print do contato com o banco.' },
  ],
  SAUDE: [
    { codigo: 'CARTEIRINHA', descricao: 'Carteirinha do plano de saúde (física ou digital)' },
    { codigo: 'CONTRATO', descricao: 'Contrato ou proposta de adesão ao plano (se tiver acesso)' },
    { codigo: 'CASO_NEGATIVA', descricao: '👉 SE FOR NEGATIVA: Print/e-mail ou ofício da recusa, Laudo médico com CID justificando a necessidade, e Exames/pedidos médicos.', sensivel: true },
    { codigo: 'CASO_REVISIONAL', descricao: '👉 SE FOR AUMENTO ABUSIVO: Histórico completo de pagamentos mensais desde o início do contrato (boletos, faturas ou extrato do app).' },
  ],
  TRABALHO: [
    { codigo: 'CTPS_DIGITAL', descricao: 'Print/foto da Carteira de Trabalho Digital (mostrando os vínculos)' },
    { codigo: 'EXTRATO_FGTS', descricao: 'Extrato do FGTS tirado do aplicativo oficial (para vermos se a empresa está depositando)' },
    { codigo: 'PROVAS_TRABALHO', descricao: 'Provas do que aconteceu (prints de WhatsApp, e-mails, recibos, fotos de cartão de ponto ou lista de testemunhas)' },
  ],
  BPC: [
    { codigo: 'NIS', descricao: 'Cartão ou número do NIS (11 dígitos) e Folha do CadÚnico' },
    { codigo: 'DOCS_FAMILIA', descricao: 'RG/CPF e comprovante de renda de TODOS os membros da família que moram na mesma casa' },
    { codigo: 'SENHA_GOV', descricao: 'Acesso (Login e Senha) do portal Gov.br (para verificarmos o cadastro no INSS)' },
    { codigo: 'CASO_DEFICIENTE', descricao: '👉 SE FOR POR DEFICIÊNCIA/DOENÇA: Laudo médico atualizado com CID, relatórios de especialistas e exames.', sensivel: true },
    { codigo: 'CASO_IDOSO', descricao: '👉 SE FOR IDOSO (65+): Certidão de nascimento ou casamento e Carteira de Trabalho (CTPS).' },
  ],
  INSS: [
    { codigo: 'SENHA_GOV', descricao: 'Senha do portal GOV.BR (necessária para análise de viabilidade)' },
    { codigo: 'CTPS', descricao: 'Carteira de Trabalho (CTPS)' },
  ],
  GOV: [
    { codigo: 'GOVBR', descricao: 'Print da conta GOV.BR ou dados de acesso' },
  ],
  GERAL: [
    { codigo: 'PROVAS', descricao: 'Todos os documentos, prints de conversas, fotos e provas que você tiver relacionadas ao seu caso' },
  ],
};

export const LINKS_ASSINATURA: Record<TipoCaso, { contrato: string; procuracao: string }> = {
  SAUDE: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/e393eb9d-23e0-49cc-965c-6cc31d020e1c',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/a5e0c61b-2f72-469b-b952-8f92ecd3f151',
  },
  BPC: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/95d8de18-3f25-4d9b-b163-e5cf8c168136',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/dfdf1a1a-95c3-4b8b-903d-7eb0c245914d',
  },
  INSS: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/95d8de18-3f25-4d9b-b163-e5cf8c168136',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/dfdf1a1a-95c3-4b8b-903d-7eb0c245914d',
  },
  VOO_ONIBUS: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/65194d71-ad5d-4192-a2b2-5838f664a6dc',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/52151f47-c845-45a7-beae-6cd1042d5ecb',
  },
  BANCO: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/65194d71-ad5d-4192-a2b2-5838f664a6dc',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/52151f47-c845-45a7-beae-6cd1042d5ecb',
  },
  TRABALHO: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/65194d71-ad5d-4192-a2b2-5838f664a6dc',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/52151f47-c845-45a7-beae-6cd1042d5ecb',
  },
  GOV: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/65194d71-ad5d-4192-a2b2-5838f664a6dc',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/52151f47-c845-45a7-beae-6cd1042d5ecb',
  },
  GERAL: {
    contrato: 'https://app.zapsign.com.br/verificar/doc/65194d71-ad5d-4192-a2b2-5838f664a6dc',
    procuracao: 'https://app.zapsign.com.br/verificar/doc/52151f47-c845-45a7-beae-6cd1042d5ecb',
  },
};

export const KEYWORDS_AJUDA = [
  'ajuda', 'não consegui', 'nao consegui', 'dúvida', 'duvida',
  'falar com advogado', 'entrar em contato', 'problema',
  'não estou conseguindo', 'nao estou conseguindo',
] as const;

export const KEYWORDS_PROCESSO = [
  'processo', 'meu processo', 'andamento', 'consultar processo',
  'ver processo', 'status do processo', '/processo',
] as const;

export const KEYWORDS_ASSINATURA = [
  'assinei', 'já assinei', 'assinado', 'finalizei',
  'terminei', 'pronto', 'ok assinado',
] as const;
