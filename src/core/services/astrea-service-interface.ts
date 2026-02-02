// src/core/services/astrea-service-interface.ts
export interface AstreaProcessoDTO {
  numero: string;
  cliente?: string;
  partes?: string;
  ultimaMovimentacao?: string;
  vara?: string;
  temAudiencia?: boolean;
}

export interface IAstreaService {
  login(): Promise<boolean>;
  getProcessosList(): Promise<AstreaProcessoDTO[]>;
  close(): Promise<void>;
}