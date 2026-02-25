import { prisma } from "../../lib/prisma.js";

export class AgendaService {

  // ✅ FUNÇÃO LIMPA: Se o campo vier vazio, converte para null
  private formatarProcessoId(id?: string | null) {
    const limpo = id?.trim();
    return limpo ? limpo : null;
  }

  // ---------------------------------------------------------
  // 1. CRIAR COMPROMISSO
  // ---------------------------------------------------------
  async createCompromisso(data: any, userId: string) {
    return prisma.compromisso.create({
      data: {
        titulo: data.titulo,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        tipo: data.tipo,
        location: data.location,
        processoId: this.formatarProcessoId(data.processoId), 
        userId,
      },
      include: { 
        user: { select: { nome: true } }, 
        processo: { select: { clienteNome: true, numeroCNJ: true } }
      }
    });
  }

  // ---------------------------------------------------------
  // 2. CRIAR TAREFA
  // ---------------------------------------------------------
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

  // ---------------------------------------------------------
  // 3. CONCLUIR TAREFA
  // ---------------------------------------------------------
  async completeTarefa(id: string) {
    return prisma.tarefa.update({
      where: { id },
      data: { concluida: true }
    });
  }

  // ---------------------------------------------------------
  // 4. LISTAR TUDO (Agenda e Tarefas)
  // ---------------------------------------------------------
  async listAll(userId: string) {
    const [compromissos, tarefas] = await Promise.all([
      prisma.compromisso.findMany({
        where: { userId },
        orderBy: { startDate: 'asc' },
        include: { 
            user: { select: { nome: true } },
            processo: { select: { clienteNome: true, numeroCNJ: true } } 
        }
      }),
      prisma.tarefa.findMany({
        where: { userId, concluida: false },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { nome: true } } }
      }),
    ]);

    return { compromissos, tarefas };
  }

  // ---------------------------------------------------------
  // 5. DELETAR COMPROMISSO
  // ---------------------------------------------------------
  async delete(id: string) {
    const deletado = await prisma.compromisso.deleteMany({
      where: { id: id }
    });
    return deletado;
  }
}