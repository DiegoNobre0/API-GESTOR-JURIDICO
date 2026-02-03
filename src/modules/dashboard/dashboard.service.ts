import { prisma } from "@/lib/prisma.js";

export class DashboardService {
  async getStats(userId: string) {
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    // Buscas paralelas para performance máxima
    const [processos, compromissosHojeCount, transacoesMes] = await Promise.all([
      prisma.processo.findMany({ 
        where: { userId: userId, arquivado: false } // Filtro corrigido para userId
      }),
      prisma.compromisso.count({
        where: { 
          userId,
          startDate: { gte: hoje, lt: amanha }
        }
      }),
      // Busca transações de entrada do mês atual
      prisma.transacao.findMany({
        where: {
          createdBy: userId,
          tipo: 'entrada',
          createdAt: { gte: primeiroDiaMes }
        }
      })
    ]);

    // Cálculo da Receita do Mês
    const receitaMes = transacoesMes.reduce((acc, t) => acc + t.valor, 0);

    // Retorno mapeado para a interface DashboardStats do Angular
    return {
      totalProcessos: processos.length,
      processosAtivos: processos.filter(p => !p.arquivado).length,
      compromissosHoje: compromissosHojeCount,
      receitaMes: receitaMes, // Campo exigido pelo front-end
      
      // Dados extras para os gráficos que você já preparou
      financeiro: {
        totalPrevisto: processos.reduce((acc, p) => acc + (p.valorPrevistoIniciais + p.valorPrevistoExito), 0),
        totalRecebido: processos.reduce((acc, p) => acc + (p.totalRecebidoIniciais + p.totalRecebidoExito), 0),
        totalCustos: processos.reduce((acc, p) => acc + p.totalCustosReais, 0),
      },
      statusDistribuicao: {
        contratoFechado: processos.filter(p => p.statusGeral === "Contrato Fechado").length,
        emAndamento: processos.filter(p => p.statusGeral === "Em Andamento").length,
      }
    };
  }


  async getGraficoFinanceiro(userId: string) {
    // Busca transações dos últimos 6 meses para o gráfico
    const transacoes = await prisma.transacao.findMany({
      where: { createdBy: userId, arquivado: false },
      orderBy: { createdAt: 'asc' }
    });

    // Agrupamento simples para o gráfico do Angular
    return {
      entradas: transacoes.filter(t => t.tipo === 'entrada').map(t => ({ data: t.data, valor: t.valor })),
      saidas: transacoes.filter(t => t.tipo === 'saida').map(t => ({ data: t.data, valor: t.valor }))
    };
  }

  async getGraficoProcessos(userId: string) {
    const processos = await prisma.processo.findMany({
      where: { userId: userId, arquivado: false }, // Usando o campo 'userId' padronizado
      select: { statusGeral: true }
    });

    // Conta processos por status para o gráfico de pizza/rosca
    const distribuicao = processos.reduce((acc: any, p) => {
      acc[p.statusGeral] = (acc[p.statusGeral] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(distribuicao).map(([label, value]) => ({ label, value }));
  }

  async getProdutividade(userId: string) {
    // Compara tarefas concluídas vs pendentes
    const [concluidas, pendentes] = await Promise.all([
      prisma.tarefa.count({ where: { userId, concluida: true } }),
      prisma.tarefa.count({ where: { userId, concluida: false } })
    ]);

    return [
      { status: 'Concluídas', total: concluidas },
      { status: 'Pendentes', total: pendentes }
    ];
  }
}