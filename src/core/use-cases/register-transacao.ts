import type { CreateTransacaoInput } from "../../infra/http/schemas/transacao-schema";
import type { ITransacaoRepository } from "../repositories/transacao-repository";


export class RegisterTransacaoUseCase {
  constructor(private transacaoRepository: ITransacaoRepository) {}

  async execute(data: CreateTransacaoInput, userId: string) {
    return await this.transacaoRepository.create({
      ...data,
      createdBy: userId
    });
  }
}