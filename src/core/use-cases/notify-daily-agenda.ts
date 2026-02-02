    import { PrismaClient } from "@prisma/client";
import { MailService } from "../../infra/services/mail-service";

const prisma = new PrismaClient();

export class NotifyDailyAgendaUseCase {
  constructor(private mailService: MailService) {}

  async execute() {
    const amanhã = new Date();
    amanhã.setDate(amanhã.getDate() + 1);
    amanhã.setHours(0, 0, 0, 0);

    const depoisDeAmanhã = new Date(amanhã);
    depoisDeAmanhã.setDate(depoisDeAmanhã.getDate() + 1);

    // 1. Procurar todos os compromissos de amanhã incluindo dados do usuário
    const compromissos = await prisma.compromisso.findMany({
      where: {
        startDate: {
          gte: amanhã,
          lt: depoisDeAmanhã,
        },
      },
      include: { user: true },
    });

    // 2. Agrupar compromissos por e-mail do advogado
    const agendaPorAdvogado: Record<string, { nome: string, itens: any[] }> = {};

    compromissos.forEach((comp) => {
      const email = comp.user.email;
      if (!agendaPorAdvogado[email]) {
        agendaPorAdvogado[email] = { nome: comp.user.nome, itens: [] };
      }
      agendaPorAdvogado[email].itens.push(comp);
    });

    // 3. Enviar os e-mails
    // Transforma o objeto em um array de [email, { nome, itens }]
for (const [email, dados] of Object.entries(agendaPorAdvogado)) {
  // Agora o TS sabe que 'dados' existe
  const { nome, itens } = dados;

  const listaHtml = itens
    .map((i: any) => `<li><strong>${i.titulo}</strong> - ${new Date(i.startDate).toLocaleTimeString('pt-BR')}</li>`)
    .join('');

  const html = `
    <div style="font-family: sans-serif; color: #333;">
      <h2>Olá, Dr. ${nome}</h2>
      <p>Aqui está o seu resumo de compromissos para amanhã, <strong>${amanhã.toLocaleDateString('pt-BR')}</strong>:</p>
      <ul>${listaHtml}</ul>
      <p>Prepare-se bem e bom trabalho!</p>
      <hr>
      <small>RCS Assistant - Sistema de Gestão Jurídica</small>
    </div>
  `;

  await this.mailService.sendEmail(email, "📅 Resumo de Agenda: Amanhã", html);
}
  }
}