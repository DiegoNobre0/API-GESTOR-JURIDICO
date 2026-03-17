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
      configEscritorio, 
      totalProcessos,
      processosAtivos,
      compromissosHoje, 
      receitaPeriodoAgg,
      processosAdvogadoAgg,
      carteiraAgg,
      leadsConvertidos,
      totalLeads
    ] = await Promise.all([
      // A) Pega a Meta do Ano da configuração global
      this.criarMeta(), 
      
      // B) Total de Processos (GLOBAL - Removido userId)
      prisma.processo.count(),
      
      // C) Processos Ativos (GLOBAL - Removido userId)
      prisma.processo.count({ where: { arquivado: false } }),
      
      // D) Compromissos Hoje (INDIVIDUAL - Mantido o userId) 👈 Único filtrado por usuário
      prisma.compromisso.findMany({ 
        where: { userId, startDate: { gte: hoje, lt: amanha } },
        orderBy: { startDate: 'asc' } 
      }),
      
      // E) Receita no Período Selecionado (GLOBAL - Removido createdBy)
      prisma.transacao.aggregate({ 
        _sum: { valor: true }, 
        where: { tipo: 'entrada', data: { gte: inicioStr, lte: fimStr } } 
      }),
      
      // F) Processos agrupados por Advogado (GLOBAL - Removido userId)
      prisma.processo.groupBy({ 
        by: ['responsavel'], 
        _count: { id: true }, 
        where: { createdAt: { gte: inicio, lte: fim } } 
      }),
      
      // G) Carteira (Por Status) (GLOBAL - Removido userId)
      prisma.processo.groupBy({ 
        by: ['tipoCaso'], // Nota: confira se no seu schema é 'tipoCaso' ou 'statusGeral'
        _count: { id: true } 
      }),
      
      // H) Leads Convertidos (Chegaram na etapa FINALIZADO do Funil) no Período
      prisma.conversation.findMany({ 
        where: { 
          workflowStep: 'FINALIZADO',
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

    // 3. Busca o Faturamento Anual (GLOBAL - Removido createdBy)
    const inicioAnoStr = new Date(hoje.getFullYear(), 0, 1).toISOString().substring(0, 10);
    const fimAnoStr = new Date(hoje.getFullYear(), 11, 31).toISOString().substring(0, 10);
    
    const faturamentoAnoAgg = await prisma.transacao.aggregate({
      _sum: { valor: true },
      where: { tipo: 'entrada', data: { gte: inicioAnoStr, lte: fimAnoStr } }
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
      totalCompromissosHoje: compromissosHoje.length, 
      receitaMes: receitaPeriodoAgg._sum.valor || 0,

      // Lista Detalhada (Array)
      compromissosHojeLista: compromissosHoje,

      // Meta Anual
      metaAnual: configEscritorio.metaFaturamento,
      faturamentoAtual: faturamentoAnoAgg._sum.valor || 0,

      // Gráfico: Produtividade por Advogado
      processosPorAdvogado: {
        labels: processosAdvogadoAgg.map(p => p.responsavel || 'Sem Responsável'),
        data: processosAdvogadoAgg.map(p => p._count.id)
      },
      
      // Gráfico: Carteira
      carteira: {
        // @ts-ignore caso o typescript reclame do tipoCaso não mapeado na interface padrão
        labels: carteiraAgg.map(p => p.tipoCaso || 'GERAL'),
        data: carteiraAgg.map(p => p._count.id)
      },

      // Gráfico: Evolução Leads Chatbot
      leadsCumulativo: {
        labels: Array.from(leadsDataMap.keys()),
        data: Array.from(leadsDataMap.values())
      },

      // Status Numéricos Extras de Leads
      leadsStats: {
        total: totalLeads,
        convertidos: leadsConvertidos.length,
        taxa: taxaConversao
      }
    };
  }

  // Função para salvar a Meta do Advogado
async atualizarMeta(novaMeta: number) {
    const configAtual = await this.criarMeta();

    return await prisma.configuracaoEscritorio.update({
      where: { id: configAtual.id },
      data: { metaFaturamento: novaMeta }
    });
  }

async criarMeta() {
  console.log(Object.keys(prisma));
    // 1. Tenta buscar a primeira (e única) configuração do banco
    let config = await prisma.configuracaoEscritorio.findFirst();

    // 2. Se não existir nada cadastrado ainda, cria uma configuração padrão
    if (!config) {
      config = await prisma.configuracaoEscritorio.create({
        data: {
          metaFaturamento: 80000 // Valor padrão inicial
        }
      });
    }

    // 3. Retorna a configuração (seja a encontrada ou a recém-criada)
    return config;
  }
}