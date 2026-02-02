import type { FastifyReply, FastifyRequest } from "fastify";
import { CreateProcessoUseCase } from "../../../core/use-cases/create-processo";
import { createProcessoSchema } from "../schemas/processo-schema";

export class ProcessoController {
  constructor(private createProcessoUseCase: CreateProcessoUseCase) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    // Validação automática com Zod
    const data = createProcessoSchema.parse(request.body);
    
    // Simulação de ID de usuário vindo do JWT (como no seu código Python)
    const userId = "6590b0e9f1a2b3c4d5e6f7a8"; 

    try {
      const processo = await this.createProcessoUseCase.execute(data, userId);
      return reply.status(201).send(processo);
    } catch (error: any) {
      return reply.status(400).send({ message: error.message });
    }
  }
}