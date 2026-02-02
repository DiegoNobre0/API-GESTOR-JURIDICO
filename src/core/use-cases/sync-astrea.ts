// src/core/use-cases/sync-astrea.ts

import type { IProcessosRepository } from "../repositories/processos-repository";
import type { IAstreaService } from "../services/astrea-service-interface";


export class SyncAstreaUseCase {
  constructor(
    private astreaService: IAstreaService,
    private repository: IProcessosRepository
  ) {}

  async execute() {
    const logou = await this.astreaService.login();
    if (!logou) throw new Error("Falha na autenticação com o Astrea.");

    const processosAstrea = await this.astreaService.getProcessosList();
    let atualizados = 0;

    for (const proc of processosAstrea) {
      const local = await this.repository.findByNumero(proc.numero);
      if (local) {
        // Atualiza campos específicos vindos do Astrea
        await this.repository.update(local.id, {
          ultimaMovimentacaoAstrea: proc.ultimaMovimentacao,
          // Outros campos de sincronização
        });
        atualizados++;
      }
    }

    await this.astreaService.close();
    return { total: processosAstrea.length, atualizados };
  }
}