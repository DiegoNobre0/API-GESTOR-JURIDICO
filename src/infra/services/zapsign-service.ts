import axios from 'axios';

export class ZapSignService {

  private readonly apiUrl = 'https://api.zapsign.com.br/api/v1';
  // private readonly apiUrl = 'https://sandbox.api.zapsign.com.br/api/v1';
  private readonly apiToken = process.env.ZAPSIGN_TOKEN!;

  async gerarDocumento(dados: any, modeloId: string, nomeArquivo: string) {
    axios.get(
  'https://api.zapsign.com.br/api/v1/docs/',
  {
    headers: {
      Authorization: `Token ${process.env.ZAPSIGN_TOKEN}`
    }
  }
)
.then(res => console.log("OK", res.data))
.catch(err => console.log("ERRO", err.response?.data));
    try {
      const response = await axios.post(
        `${this.apiUrl}/models/create-doc/`,
        {
          sandbox: true, // 👈 importante para ambiente de testes
          template_id: modeloId,
          signer_name: dados.nome,
          send_automatic_email: false,
          send_automatic_whatsapp: false,
          lang: "pt-br",
          external_id: `proc-${Date.now()}`, // 👈 importante para rastrear no seu sistema
          data: [
            { de: "{{NOME COMPLETO}}", para: dados.nome },
            { de: "{{NÚMERO DO CPF}}", para: dados.cpf },
            { de: "{{ENDEREÇO COMPLETO}}", para: dados.endereco }
          ]
        },
        {
          headers: {
            Authorization: `Token ${this.apiToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      return {
        id: response.data.id,
        tipo: 'ZAPSIGN',
        nomeArquivo,
        url: response.data.signers[0].sign_url,
        status: response.data.status
      };

    } catch (error: any) {
      console.error("Erro ZapSign:", error.response?.data || error.message);
      return null;
    }
  }
}