import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export class GetDashboardStatsUseCase {
  async execute() {
    const processos = await prisma.processo.findMany({ where: { arquivado: false } });

    // Cálculo de Expectativa vs Realidade
    const stats = {
      totalPrevisto: processos.reduce((acc, p) => acc + (p.valorPrevistoIniciais + p.valorPrevistoExito), 0),
      totalRecebido: processos.reduce((acc, p) => acc + (p.totalRecebidoIniciais + p.totalRecebidoExito), 0),
      totalCustos: processos.reduce((acc, p) => acc + p.totalCustosReais, 0),
      countProcessos: processos.length,
      statusDistribuicao: {
        contratoFechado: processos.filter(p => p.statusGeral === "Contrato Fechado").length,
        emAndamento: processos.filter(p => p.statusGeral === "Em Andamento").length,
      }
    };

    return stats;
  }
}