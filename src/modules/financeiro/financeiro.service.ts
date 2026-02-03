import { prisma } from "@/lib/prisma.js";
import type { CreateFinanceiroInput } from "./dto/create-financeiro.dto.js";


export class FinanceiroService {
  async create(data: CreateFinanceiroInput, userId: string) {
    return await prisma.$transaction(async (tx) => {
      // 1. Cria o registro financeiro
      const transacao = await tx.transacao.create({
        data: {
          tipo: data.tipo,
          categoria: data.categoria,
          valor: data.valor,
          data: data.data.toISOString(), // Garantindo o formato de string se seu schema for String
          descricao: data.descricao,
          recorrente: data.recorrente,
          processoId: data.processoId ?? null,
          createdBy: userId
        }
      });

      // 2. Sincroniza os totais do Processo (Expectativa vs Realidade)
      if (data.processoId) {
        let field: "totalRecebidoIniciais" | "totalRecebidoExito" | "totalCustosReais" | null = null;

        if (data.categoria.includes("Iniciais")) field = "totalRecebidoIniciais";
        else if (data.categoria.includes("Êxito")) field = "totalRecebidoExito";
        else if (data.tipo === "saida") field = "totalCustosReais";

        if (field) {
          await tx.processo.update({
            where: { id: data.processoId },
            data: { [field]: { increment: data.valor } }
          });
        }
      }

      return transacao;
    });
  }

  async list(userId: string) {
    return await prisma.transacao.findMany({
      where: { createdBy: userId, arquivado: false },
      orderBy: { createdAt: 'desc' }
    });
  }

  async setArquivado(id: string, userId: string, status: boolean) {
    return await prisma.transacao.updateMany({
      where: { id, createdBy: userId },
      data: { arquivado: status }
    });
  }

  // Método que centraliza a exclusão e protege os dados por usuário
  async delete(id: string, userId: string) {
    return await prisma.transacao.deleteMany({
      where: { 
        id, 
        createdBy: userId // Proteção: só deleta se for o dono do registro
      }
    });
  }
}