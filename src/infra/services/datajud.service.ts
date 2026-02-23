import axios from 'axios';

interface Movimento {
  codigo: number;
  nome: string;
  dataHora: string;
  orgaoJulgador?: {
    nome?: string;
  };
}

export interface ConsultaMovimentacaoResponse {
  tribunal?: string | null;
  juizo: string;
  classe: string;
  movimentos: Movimento[];
}

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
        {
          query: { match: { numeroProcesso: numeroLimpo } }
        },
        {
          headers: { Authorization: `ApiKey ${this.apiKey}` }
        }
      );

      const hits = response.data.hits.hits;
      if (!hits.length) return null;

      const dados = hits[0]._source;

      if (!dados.movimentos?.length) return null;

      return {
        tribunal: dados.tribunal ?? null,
        juizo: dados.orgaoJulgador?.nome ?? 'Não informado',
        classe: dados.classe?.nome ?? 'Não informado',
        movimentos: dados.movimentos.map((m: any) => ({
          codigo: m.codigo,
          nome: m.nome,
          dataHora: m.dataHora,
          orgaoJulgador: m.orgaoJulgador
        }))
      };
    } catch (error: any) {
      console.error(
        'Erro ao consultar CNJ:',
        error.response?.data || error.message
      );
      return null;
    }
  }
}