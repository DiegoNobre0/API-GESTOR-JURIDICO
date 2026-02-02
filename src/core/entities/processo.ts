import type { CreateProcessoInput } from "../../infra/http/schemas/processo-schema";


export class Processo {
  public readonly id?: any;
  public props: CreateProcessoInput;

  constructor(props: CreateProcessoInput, id?: any) {
    this.props = props;
    this.id = id;
    
    // Validação de Regra de Negócio Sênior
    this.validateHonorarios();
  }

  // Exemplo de lógica de domínio: Garante que processos com honorários 
  // de êxito tenham uma base de previsão
  private validateHonorarios() {
    if (
      (this.props.tipoHonorarios === 'Êxito' || this.props.tipoHonorarios === 'Ambos') && 
      !this.props.basePrevisao
    ) {
      throw new Error("Processos com honorários de êxito precisam de uma base de previsão.");
    }
  }

  // Getters para facilitar o acesso mantendo a imutabilidade
  get numero() { return this.props.numeroProcesso; }
  get responsavel() { return this.props.responsavel; }
  get status() { return this.props.statusGeral; }
}