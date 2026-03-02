import { prisma } from "../../lib/prisma.js";

export class DashboardService {
  
  async getStats(userId: string, dataInicial?: string, dataFinal?: string) {
    // 1. Tratamento das Datas do Filtro
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);

    const inicio = dataInicial ? new Date(dataInicial) : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = dataFinal ? new Date(dataFinal) : new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    fim.setHours(23, 59, 59, 999);

    // No banco, a Transacao salva a data como String (YYYY-MM-DD)
    const inicioStr = inicio.toISOString().substring(0, 10);
    const fimStr = fim.toISOString().substring(0, 10);

    // 2. Consultas Simultâneas para Máxima Performance
    const [
      user,
      totalProcessos,
      processosAtivos,
      compromissosHoje,
      receitaPeriodoAgg,
      processosAdvogadoAgg,
      carteiraAgg,
      leadsConvertidos,
      totalLeads // 👈 ADICIONADO: Total de leads que chamaram no bot
    ] = await Promise.all([
      // A) Pega a Meta do Ano
      prisma.user.findUnique({ where: { id: userId }, select: { metaFaturamento: true } }),
      // B) Total de Processos
      prisma.processo.count({ where: { userId } }),
      // C) Processos Ativos
      prisma.processo.count({ where: { userId, arquivado: false } }),
      // D) Compromissos Hoje
      prisma.compromisso.count({ where: { userId, startDate: { gte: hoje, lt: amanha } } }),
      // E) Receita no Período Selecionado
      prisma.transacao.aggregate({ 
        _sum: { valor: true }, 
        where: { createdBy: userId, tipo: 'entrada', data: { gte: inicioStr, lte: fimStr } } 
      }),
      // F) Processos agrupados por Advogado (No período selecionado)
      prisma.processo.groupBy({ 
        by: ['responsavel'], 
        _count: { id: true }, 
        where: { userId, createdAt: { gte: inicio, lte: fim } } 
      }),
      // G) Carteira (Por Status)
      prisma.processo.groupBy({ 
        by: ['tipoCaso'], 
        _count: { id: true }, 
        where: { userId } 
      }),
      // H) Leads Convertidos (Chegaram na etapa FINALIZADO do Funil) no Período
      prisma.conversation.findMany({ 
        where: { 
          
          workflowStep: 'FINALIZADO', // 👈 REGRA APLICADA AQUI
          createdAt: { gte: inicio, lte: fim } 
        }, 
        select: { createdAt: true }, 
        orderBy: { createdAt: 'asc' } 
      }),
      // I) Total de Leads (Qualquer pessoa que iniciou conversa no bot)
      prisma.conversation.count({
        where: {          
          createdAt: { gte: inicio, lte: fim }
        }
      })
    ]);

    // 3. Busca o Faturamento Anual (Para a barra de Realizado da Meta)
    const inicioAnoStr = new Date(hoje.getFullYear(), 0, 1).toISOString().substring(0, 10);
    const fimAnoStr = new Date(hoje.getFullYear(), 11, 31).toISOString().substring(0, 10);
    
    const faturamentoAnoAgg = await prisma.transacao.aggregate({
      _sum: { valor: true },
      where: { createdBy: userId, tipo: 'entrada', data: { gte: inicioAnoStr, lte: fimAnoStr } }
    });

    // 4. Constrói a curva de crescimento do Gráfico de Leads
    const leadsDataMap = new Map<string, number>();
    let acumulado = 0;
    
    // Se não houver conversões no filtro, gera dados vazios
    if (leadsConvertidos.length === 0) {
      leadsDataMap.set('Sem Dados', 0);
    } else {
      leadsConvertidos.forEach(l => {
        const labelData = l.createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        acumulado += 1;
        leadsDataMap.set(labelData, acumulado); // Vai empilhando 1, 2, 3...
      });
    }

    // Calcula a Taxa de Conversão (Convertidos vs Total)
    const taxaConversao = totalLeads > 0 ? Math.round((leadsConvertidos.length / totalLeads) * 100) : 0;

    // 5. Retorna um objeto gigante, perfeitamente mapeado para o Angular
    return {
      // KPIs
      totalProcessos,
      processosAtivos,
      compromissosHoje,
      receitaMes: receitaPeriodoAgg._sum.valor || 0,

      // Meta Anual
      metaAnual: user?.metaFaturamento || 80000,
      faturamentoAtual: faturamentoAnoAgg._sum.valor || 0,

      // Gráfico: Produtividade por Advogado
      processosPorAdvogado: {
        labels: processosAdvogadoAgg.map(p => p.responsavel || 'Sem Responsável'),
        data: processosAdvogadoAgg.map(p => p._count.id)
      },
      
      // Gráfico: Carteira
      carteira: {
        labels: carteiraAgg.map(p => p.tipoCaso || 'GERAL'),
        data: carteiraAgg.map(p => p._count.id)
      },

      // Gráfico: Evolução Leads Chatbot
      leadsCumulativo: {
        labels: Array.from(leadsDataMap.keys()),
        data: Array.from(leadsDataMap.values())
      },

      // Status Numéricos Extras de Leads (Para usar naqueles textinhos ao lado do gráfico)
      leadsStats: {
        total: totalLeads,
        convertidos: leadsConvertidos.length,
        taxa: taxaConversao
      }
    };
  }

  // 👇 Nova Função para salvar a Meta do Advogado
  async atualizarMeta(userId: string, novaMeta: number) {
    return await prisma.user.update({
      where: { id: userId },
      data: { metaFaturamento: novaMeta }
    });
  }
}