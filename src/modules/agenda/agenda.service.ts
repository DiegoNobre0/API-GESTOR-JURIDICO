import { prisma } from "../../lib/prisma.js";

export class AgendaService {

  // ✅ FUNÇÃO LIMPA: Se o campo vier vazio, converte para undefined
  private formatarProcessoId(id?: string) {
    const limpo = id?.trim();
    return limpo ? limpo : undefined;
  }

  // Criar Compromisso
  async createCompromisso(data: any, userId: string) {
    return prisma.compromisso.create({
      data: {
        ...data,
        processoId: this.formatarProcessoId(data.processoId), 
        userId,
      },
      include: { user: { select: { nome: true } } }
    });
  }

  // Criar Tarefa
  async addTarefa(data: any, userId: string) {
    return prisma.tarefa.create({
      data: {
        ...data,
        processoId: this.formatarProcessoId(data.processoId), 
        userId, 
        concluida: false
      },
      include: { user: { select: { nome: true } } }
    });
  }

  // Concluir Tarefa
  async completeTarefa(id: string) {
    return prisma.tarefa.update({
      where: { id },
      data: { concluida: true }
    });
  }

  // Listagem Unificada
  async listAll(userId: string) {
    const [compromissos, tarefas] = await Promise.all([
      prisma.compromisso.findMany({
        where: { userId },
        orderBy: { startDate: 'asc' },
        include: { user: { select: { nome: true } } }
      }),
      prisma.tarefa.findMany({
        where: { userId, concluida: false },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { nome: true } } }
      }),
    ]);

    return { compromissos, tarefas };
  }

  async delete(id: string) {
    return prisma.compromisso.delete({
      where: { id },
    });
  }
}