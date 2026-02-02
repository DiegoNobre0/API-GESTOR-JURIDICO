import { PrismaClient } from "@prisma/client";
import type { IProcessosRepository } from "../../core/repositories/processos-repository";

// Instanciamos o cliente (Senior Tip: Em produção, isso deve ser um Singleton)
const prisma = new PrismaClient();

export class PrismaProcessosRepository implements IProcessosRepository {
  async create(data: any) {
    return await prisma.processo.create({ data });
  }

  async findByNumero(numero: string) {
    return await prisma.processo.findFirst({
      where: { numeroProcesso: numero }
    });
  }

  async listAll() {
    return await prisma.processo.findMany({
      where: { arquivado: false },
      orderBy: { createdAt: 'desc' }
    });
  }

  // A implementação que estava faltando:
  async update(id: string, data: any) {
    return await prisma.processo.update({
      where: { id },
      data
    });
  }
}