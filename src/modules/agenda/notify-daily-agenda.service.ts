
import type { MailService } from "../../infra/services/mail-service.js";
import { prisma } from "../../lib/prisma.js"; // Usando a instância centralizada

export class NotifyDailyAgendaService {
  // Removido o 'typeof prisma' do construtor para usar a instância global diretamente se preferir, 
  // ou mantendo a injeção para facilitar testes unitários.
  constructor(
    private mailService: MailService
  ) {}

  async execute() {
    // Cálculo das datas (Amanhã 00:00 até Depois de Amanhã 00:00)
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    amanha.setHours(0, 0, 0, 0);

    const depoisDeAmanha = new Date(amanha);
    depoisDeAmanha.setDate(depoisDeAmanha.getDate() + 1);

    // 1. Busca compromissos incluindo os dados do Advogado (User)
    const compromissos = await prisma.compromisso.findMany({
      where: {
        startDate: {
          gte: amanha,
          lt: depoisDeAmanha,
        },
      },
      include: { 
        user: true // Essencial para pegar o e-mail e nome do Dr.
      },
    });

    // 2. Agrupamento por Advogado
    const agendaPorAdvogado: Record<string, { nome: string, itens: any[] }> = {};

    compromissos.forEach((comp) => {
      const email = comp.user.email;
      if (!agendaPorAdvogado[email]) {
        agendaPorAdvogado[email] = { nome: comp.user.nome, itens: [] };
      }
      agendaPorAdvogado[email].itens.push(comp);
    });

    // 3. Processamento e Envio
    for (const [email, dados] of Object.entries(agendaPorAdvogado)) {
      const { nome, itens } = dados;

      // Formatação da lista de horários
      const listaHtml = itens
        .map((i) => `
          <li style="margin-bottom: 8px;">
            <strong style="color: #2c3e50;">${new Date(i.startDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong> - ${i.title}
          </li>
        `)
        .join('');

      const html = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
          <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Olá, Dr(a). ${nome}</h2>
          <p>Este é o seu resumo de compromissos para amanhã, <strong>${amanha.toLocaleDateString('pt-BR')}</strong>:</p>
          <ul style="list-style: none; padding-left: 0;">
            ${listaHtml}
          </ul>
          <p style="margin-top: 20px;">Desejamos um excelente dia de trabalho!</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <small style="color: #95a5a6; display: block; text-align: center;">Nobre Gestor Jurídico - Automação de Agenda</small>
        </div>
      `;

      // Envio assíncrono usando o seu MailService
      await this.mailService.sendEmail(email, `📅 Sua Agenda: ${amanha.toLocaleDateString('pt-BR')}`, html);
    }
  }
}