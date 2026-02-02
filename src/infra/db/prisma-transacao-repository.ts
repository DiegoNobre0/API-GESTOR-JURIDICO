import { PrismaClient } from "@prisma/client";
import type { ITransacaoRepository } from "../../core/repositories/transacao-repository";

const prisma = new PrismaClient();

export class PrismaTransacaoRepository implements ITransacaoRepository {
  async create(data: any) {
    // 1. Cria a transação
    const transacao = await prisma.transacao.create({ data });

    // 2. Se houver processoId, atualiza os totais no processo
    if (data.processoId) {
      const field = data.categoria.includes("Iniciais") 
        ? "totalRecebidoIniciais" 
        : data.categoria.includes("Êxito") 
          ? "totalRecebidoExito" 
          : data.tipo === "saida" ? "totalCustosReais" : null;

      if (field) {
        await prisma.processo.update({
          where: { id: data.processoId },
          data: { [field]: { increment: data.valor } }
        });
      }
    }
    return transacao;
  }

  async listByProcesso(processoId: string) {
    return await prisma.transacao.findMany({ where: { processoId } });
  }
}