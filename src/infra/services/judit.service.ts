import axios from 'axios';

export class JuditService {
  private readonly apiKey = process.env.JUDIT_API_KEY;
  private readonly apiUrl = 'https://api.judit.io/v1';

  async consultarMovimentacoes(numeroCNJ: string) {
    try {
      const response = await axios.get(`${this.apiUrl}/processos/${numeroCNJ}`, {
        headers: { 'X-API-Key': this.apiKey }
      });
      
      // Retorna os movimentos novos (exemplo simplificado)
      return response.data;
    } catch (error) {
      console.error(`Erro ao consultar processo ${numeroCNJ}:`, error);
      return null;
    }
  }


  async buscarPorOAB(oab: string, uf: string) {
    try {
      const response = await axios.get(`${this.apiUrl}/oab/${uf}/${oab}`, {
        headers: { 'X-API-Key': this.apiKey }
      });
      return response.data.processos; // Retorna a lista de números CNJ e capas
    } catch (error: any) {
      console.error('Erro Judit OAB:', error.response?.data || error.message);
      throw new Error('Falha ao consultar OAB na Judit');
    }
  }

  /**
   * Consulta os detalhes e movimentações de um processo específico.
   */
  async consultarDetalhes(numeroProcesso: string) {
    try {
      const response = await axios.get(`${this.apiUrl}/processos/${numeroProcesso}`, {
        headers: { 'X-API-Key': this.apiKey }
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro Judit Processo ${numeroProcesso}:`, error.response?.data);
      return null;
    }
  }
}