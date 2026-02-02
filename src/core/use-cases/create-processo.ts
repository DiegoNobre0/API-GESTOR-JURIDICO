// src/core/use-cases/create-processo.ts
import type { CreateProcessoInput } from "../../infra/http/schemas/processo-schema";
import { Processo } from "../entities/processo";
import type { IProcessosRepository } from "../repositories/processos-repository";


export class CreateProcessoUseCase {
  constructor(
    private processosRepository: IProcessosRepository
  ) {}

  async execute(input: CreateProcessoInput, createdBy: string) {
    // 1. Regra de Negócio: Verificar se o número do processo já existe
    if (input.numeroProcesso) {
      const processoExistente = await this.processosRepository.findByNumero(input.numeroProcesso);
      if (processoExistente) {
        throw new Error("Já existe um processo cadastrado com este número.");
      }
    }

    // 2. Instanciar a Entidade de Domínio
    // Isso executa as validações internas de honorários que criamos no passo anterior
    const processo = new Processo(input);

    // 3. Persistir no Banco de Dados via Repositório
    // Passamos os dados limpos e o ID de quem está criando
    const novoProcesso = await this.processosRepository.create({
      ...processo.props,
      createdBy,
      totalRecebidoIniciais: 0,
      totalRecebidoExito: 0,
      totalCustosReais: 0
    });

    return novoProcesso;
  }
}