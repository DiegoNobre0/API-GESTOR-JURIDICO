// src/services/datajud.service.ts
import axios from 'axios';

interface Movimento {
  codigo: number;
  nome: string;
  dataHora: string;
  orgaoJulgador?: { nome?: string };
}

export interface ConsultaMovimentacaoResponse {
  tribunal?: string | null;
  juizo: string;
  classe: string;
  assuntos?: Array<{ nome: string }>;
  movimentos: Movimento[];
  orgaoJulgador?: { nome: string };
  dataUltimaMovimentacao?: Date | null;
  // Adicione a propriedade sistema
  sistema?: string | { nome: string } | null;
}

// Quantos dias sem atualização no DataJud antes de ir buscar no scraper
const DIAS_TOLERANCIA_DESATUALIZADO = 1;

export class DatajudService {
  private readonly apiKey = process.env.DATAJUD_API_KEY!;
  private readonly apiUrl =
    'https://api-publica.datajud.cnj.jus.br/api_publica_*/_search';

  async consultarMovimentacoes(
    numeroProcesso: string
  ): Promise<ConsultaMovimentacaoResponse | null> {
    try {
      const numeroLimpo = numeroProcesso.replace(/[^\d]/g, '');

      const response = await axios.post(
        this.apiUrl,
        { query: { match: { numeroProcesso: numeroLimpo } } },
        { headers: { Authorization: `ApiKey ${this.apiKey}` } }
      );

      const hits = response.data.hits.hits;
      if (!hits.length) return null;

      const dados = hits[0]._source;
      if (!dados.movimentos?.length) return null;

      const movimentos: Movimento[] = dados.movimentos.map((m: any) => ({
        codigo: m.codigo,
        nome: m.nome,
        dataHora: m.dataHora,
        orgaoJulgador: m.orgaoJulgador,
      }));

      // Determina a data da movimentação mais recente
      const dataUltimaMovimentacao = movimentos.reduce<Date | null>((mais, m) => {
        const d = new Date(m.dataHora);
        if (isNaN(d.getTime())) return mais;
        return !mais || d > mais ? d : mais;
      }, null);

      return {
        tribunal: dados.tribunal ?? null,
        juizo: dados.orgaoJulgador?.nome ?? 'Não informado',
        classe: dados.classe?.nome ?? 'Não informado',
        assuntos: dados.assuntos,
        orgaoJulgador: dados.orgaoJulgador,
        movimentos,
        dataUltimaMovimentacao,
        sistema: dados.sistema, // Adicionando isso aqui
      };
    } catch (error: any) {
      console.error('Erro ao consultar DataJud:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Retorna true se a data da última movimentação estiver dentro
   * do prazo de tolerância (dados ainda são considerados frescos).
   */
  estaAtualizado(dataUltima: Date | null | undefined): boolean {
    if (!dataUltima) return false;
    const diasDesdeUltima = (Date.now() - dataUltima.getTime()) / (1000 * 60 * 60 * 24);
    return diasDesdeUltima <= DIAS_TOLERANCIA_DESATUALIZADO;
  }
}