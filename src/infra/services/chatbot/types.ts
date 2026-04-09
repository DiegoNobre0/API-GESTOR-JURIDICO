export type Intent =
  | 'SAUDACAO_RETORNO'
  | 'APRESENTACAO_INICIAL'
  | 'ABRIR_RELATO'
  | 'PEDIR_NOME'
  | 'PEDIR_RELATO'
  | 'AVISO_DADO_SENSIVEL'
  | 'AGUARDAR_RESPOSTA'
  | 'FALLBACK_ETAPA'
  | 'TRANSICAO_ETAPA'
  | 'AGUARDAR_DOCUMENTOS'
  | 'ASSINATURA_PREPARO';

export type WorkflowStep =
  | 'COLETA_FATOS'
  | 'COLETA_DOCS'
  | 'COLETA_DOCS_EXTRA'
  | 'ASSINATURA'
  | 'FINALIZADO';

export type TipoCaso =
  | 'VOO_ONIBUS'
  | 'BANCO'
  | 'SAUDE'
  | 'TRABALHO'
  | 'GERAL'
  | 'BPC'
  | 'INSS'
  | 'GOV';

export type TemperaturaLead = 'QUENTE' | 'MORNO' | 'FRIO';

export interface ClassificacaoResult {
  tipoCaso: TipoCaso;
  qualificacaoLead: TemperaturaLead;
}

export type DocumentoChecklist = {
  codigo: string;
  descricao: string;
  sensivel?: boolean;
};

export type TempDataFatos = {
  dinamica_do_dano?: string;
  empresa?: string;
  data_do_ocorrido?: string;
  prejuizo?: string;
  aguardandoDocumentos?: boolean;
};

export type ConversationContext = {
  estadoAtual: WorkflowStep;
  tipoCaso: TipoCaso;
  documentosFaltantes: string[];
  documentosEsperadosAgora?: string[];
  presentedAt: Date | null;
  saudacaoTempo?: string;
  fatos?: any;
  tempData?: any;
};
