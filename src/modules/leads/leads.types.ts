// src/leads/types.ts

export interface DocumentoView {
  id: string;
  tipo: string;
  fileName: string;
  mediaUrl: string;
  validado: boolean;
  etapa: 'ESSENCIAL' | 'COMPLEMENTAR';
}

export interface LeadJuridico {
  id: string;
  nome: string;
  telefone: string;
  canal: string;
  dataEntrada: Date;
  ultimaMensagem: string;

  // Campos mapeados do tempData
  tipoCaso: string;
  empresa: string;
  dataOcorrido: string;
  dinamicaDoDano: string;
  prejuizo: string;

  workflowStep: string;
  aguardandoDocumentos: boolean;

  documentosEssenciais: DocumentoView[];
  documentosComplementares: DocumentoView[];
}