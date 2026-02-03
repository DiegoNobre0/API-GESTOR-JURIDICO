import type { CreateProcessoInput } from "../dto/create-processo.dto.js";


export class ProcessoEntity {
  constructor(public props: CreateProcessoInput) {
    this.validateHonorarios();
  }

  private validateHonorarios() {
    if (['Êxito', 'Ambos'].includes(this.props.tipoHonorarios) && !this.props.basePrevisao) {
      throw new Error("Processos com honorários de êxito precisam de uma base de previsão.");
    }
  }
}