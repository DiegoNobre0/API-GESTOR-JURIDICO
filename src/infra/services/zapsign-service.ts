import axios from 'axios';

export class ZapSignService {
  // ⚠️ Adicione ZAPSIGN_TOKEN no seu .env
  private token = process.env.ZAPSIGN_TOKEN; 
  private apiUrl = 'https://api.zapsign.com.br/api/v1';

  async criarContrato(nomeCliente: string, templateId: string, emailCliente: string = 'email@padrao.com') {
    try {
      const payload = {
        template_id: templateId,
        signer_name: nomeCliente,
        send_automatic_email: false,
        send_automatic_whatsapp: false,
        lang: "pt-br",
        signers: [
          {
            name: nomeCliente,
            email: emailCliente,
            auth_mode: "assinaturaTela",
            send_automatic_email: false,
            send_automatic_whatsapp: false
          }
        ]
      };

      const response = await axios.post(`${this.apiUrl}/models/create-doc/`, payload, {
        headers: { 
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        }
      });

      return {
        docId: response.data.doc_token,
        linkAssinatura: response.data.signers[0].sign_url
      };

    } catch (error: any) {
      console.error('Erro ZapSign:', error.response?.data || error.message);
      throw new Error('Falha ao gerar contrato na ZapSign');
    }
  }
}