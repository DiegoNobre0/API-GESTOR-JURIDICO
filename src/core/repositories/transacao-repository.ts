import type { CreateTransacaoInput } from "../../infra/http/schemas/transacao-schema";


export interface ITransacaoRepository {
  create(data: CreateTransacaoInput & { createdBy: string }): Promise<any>;
  listByProcesso(processoId: string): Promise<any[]>;
}