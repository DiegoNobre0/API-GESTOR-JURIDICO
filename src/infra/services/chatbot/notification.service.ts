
import { prisma } from '@/lib/prisma.js';
import { MailService } from '../mail-service.js';

export type NotificacaoTipo = 'ASSINOU' | 'AJUDA' | 'PRIMEIRO_CONTATO' | 'CASO_ESPECIFICO';

type NotificacaoConfig = {
  subject: string;
  tituloAlert: string;
  mensagem: string;
  corDestaque: string;
};

export class NotificationService {
  private mail = new MailService();

  async notificarAdvogado(tipo: NotificacaoTipo, conversation: any): Promise<void> {
    const advogados = await prisma.user.findMany({ where: { ativo: true } });
    if (!advogados || advogados.length === 0) return;

    const nomeCliente = conversation.customerName || 'Não identificado';
    const telefoneCliente = conversation.customerPhone || 'Sem telefone';
    const config = this.buildConfig(tipo, nomeCliente);

    const html = this.buildEmailHtml({
      ...config,
      nomeCliente,
      telefoneCliente,
      linkSistema: 'https://gestor-juridico-front.vercel.app',
    });

    await this.mail.sendEmail(
      advogados.map(adv => adv.email).join(', '),
      config.subject,
      html,
    );
  }

  private buildConfig(tipo: NotificacaoTipo, nomeCliente: string): NotificacaoConfig {
    switch (tipo) {
      case 'ASSINOU':
        return {
          subject: '✅ Contrato Assinado: ' + nomeCliente,
          tituloAlert: 'Documentos Assinados!',
          mensagem: 'Ótima notícia! O cliente concluiu a assinatura dos documentos com sucesso.',
          corDestaque: '#10b981',
        };
      case 'AJUDA':
        return {
          subject: '🚨 Cliente precisa de suporte: ' + nomeCliente,
          tituloAlert: 'Solicitação de Ajuda',
          mensagem: 'O cliente travou na etapa do robô e solicitou intervenção humana para continuar.',
          corDestaque: '#ef4444',
        };
      case 'PRIMEIRO_CONTATO':
        return {
          subject: '👋 Novo Lead no WhatsApp: ' + nomeCliente,
          tituloAlert: 'Novo Contato Iniciado',
          mensagem: 'Um novo lead começou a interagir com o assistente virtual do escritório.',
          corDestaque: '#f59e0b',
        };
      case 'CASO_ESPECIFICO':
        return {
          subject: '⚠️ Análise e Contrato Personalizado: ' + nomeCliente,
          tituloAlert: 'Caso Genérico / Específico',
          mensagem:
            'O cliente finalizou o envio de provas, mas o caso foi classificado como GERAL. É necessário que a equipe faça a análise humana para gerar e enviar um contrato/procuração personalizados diretamente pelo WhatsApp.',
          corDestaque: '#8b5cf6',
        };
    }
  }

  private buildEmailHtml(params: {
    tituloAlert: string;
    mensagem: string;
    corDestaque: string;
    nomeCliente: string;
    telefoneCliente: string;
    linkSistema: string;
  }): string {
    const { tituloAlert, mensagem, corDestaque, nomeCliente, telefoneCliente, linkSistema } = params;

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9; margin: 0; padding: 40px 20px;">
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            
            <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
              
              <tr>
                <td style="background-color: #0f172a; padding: 30px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">RCS Advogados</h1>
                  <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 14px;">Notificação do Sistema</p>
                </td>
              </tr>

              <tr>
                <td style="padding: 40px 30px;">
                  
                  <h2 style="margin: 0 0 15px 0; color: ${corDestaque}; font-size: 20px;">${tituloAlert}</h2>
                  <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                    ${mensagem}
                  </p>

                  <table width="100%" border="0" cellspacing="0" cellpadding="20" style="background-color: #f8fafc; border-left: 4px solid ${corDestaque}; border-radius: 4px;">
                    <tr>
                      <td>
                        <p style="margin: 0 0 10px 0; font-size: 15px; color: #1e293b;">
                          <strong style="color: #64748b;">👤 Cliente:</strong> ${nomeCliente}
                        </p>
                        <p style="margin: 0; font-size: 15px; color: #1e293b;">
                          <strong style="color: #64748b;">📱 Telefone:</strong> ${telefoneCliente}
                        </p>
                      </td>
                    </tr>
                  </table>

                  <div style="text-align: center; margin-top: 35px;">
                    <a href="${linkSistema}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">
                      Acessar Gestor Jurídico
                    </a>
                  </div>

                </td>
              </tr>

              <tr>
                <td style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                    Este é um e-mail automático enviado pelo seu assistente virtual.<br>
                    Por favor, não responda a este e-mail.
                  </p>
                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
    `;
  }
}
