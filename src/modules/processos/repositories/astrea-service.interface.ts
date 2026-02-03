// src/modules/processos/repositories/astrea-service.interface.ts

export interface AstreaProcessoDTO {
  numero: string;
  cliente?: string;
  partes?: string;
  ultimaMovimentacao?: string;
  vara?: string;
  temAudiencia?: boolean;
  dataSincronizacao?: Date; // Dica: Útil para o log do SyncAstreaService
}

export interface IAstreaService {
  login(): Promise<boolean>;
  getProcessosList(): Promise<AstreaProcessoDTO[]>;
  close(): Promise<void>;
}