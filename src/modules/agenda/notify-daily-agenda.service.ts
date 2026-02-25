import type { MailService } from "../../infra/services/mail-service.js";
import { prisma } from "../../lib/prisma.js";

export class NotifyDailyAgendaService {
  constructor(private mailService: MailService) {}

  async execute() {
    const amanhaInicio = new Date();
    amanhaInicio.setDate(amanhaInicio.getDate() + 1);
    amanhaInicio.setHours(0, 0, 0, 0);

    const amanhaFim = new Date(amanhaInicio);
    amanhaFim.setHours(23, 59, 59, 999);

    // 👇 Correção do erro: adicionamos o '?? ""' para garantir que nunca seja undefined
    const amanhaString: string = amanhaInicio.toISOString().split('T')[0] ?? "";

    const [compromissos, tarefas] = await Promise.all([
      prisma.compromisso.findMany({
        where: {
          startDate: { gte: amanhaInicio, lte: amanhaFim },
          user: { notificarAgenda: true }
        },
        include: { 
          user: true,
          processo: true // Detalhamento do processo no compromisso
        }
      }),
      prisma.tarefa.findMany({
        where: {
          prazo: amanhaString,
          concluida: false,
          user: { notificarAgenda: true }
        },
        include: { 
          user: true 
          // Se quiser detalhar o cliente na tarefa, precisa adicionar a 
          // relação no schema.prisma primeiro.
        }
      })
    ]);

    const agendaPorAdvogado: Record<string, { nome: string, email: string, compromissos: any[], tarefas: any[] }> = {};

    // Agrupamento seguro
    compromissos.forEach((c: any) => {
      const email = c.user?.email;
      if (!email) return;

      if (!agendaPorAdvogado[email]) {
        agendaPorAdvogado[email] = { nome: c.user.nome, email: email, compromissos: [], tarefas: [] };
      }
      agendaPorAdvogado[email].compromissos.push(c);
    });

    tarefas.forEach((t: any) => {
      const email = t.user?.email;
      if (!email) return;

      if (!agendaPorAdvogado[email]) {
        agendaPorAdvogado[email] = { nome: t.user.nome, email: email, compromissos: [], tarefas: [] };
      }
      agendaPorAdvogado[email].tarefas.push(t);
    });

    for (const [email, dados] of Object.entries(agendaPorAdvogado)) {
      
      // Detalhamento Rico de Compromissos
      const htmlCompromissos = dados.compromissos.length > 0 
        ? dados.compromissos.map(i => {
            const hora = new Date(i.startDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            // Puxa o cliente se houver processo vinculado
            const infoProcesso = i.processo 
              ? `<br><span style="color: #475569; font-size: 13px;">👥 <b>Cliente:</b> ${i.processo.clienteNome}</span>`
              : '';
            const numCnj = i.processo?.numeroCNJ 
              ? `<br><span style="color: #475569; font-size: 12px;">📑 <b>CNJ:</b> ${i.processo.numeroCNJ}</span>`
              : '';

            return `
            <li style="margin-bottom: 15px; border-left: 4px solid #3b82f6; padding-left: 12px;">
              <strong style="color: #1e293b; font-size: 15px;">${hora} - ${i.titulo}</strong>
              ${infoProcesso}
              ${numCnj}
              ${i.location ? `<br><span style="color: #64748b; font-size: 12px;">📍 ${i.location}</span>` : ''}
            </li>`;
          }).join('')
        : '<li><em style="color: #94a3b8;">Nenhum compromisso com hora marcada.</em></li>';

      // Detalhamento de Tarefas/Prazos
      const htmlTarefas = dados.tarefas.length > 0 
        ? dados.tarefas.map(t => `
            <li style="margin-bottom: 10px; border-left: 4px solid #f59e0b; padding-left: 12px;">
              <strong style="color: #1e293b;">${t.titulo}</strong>
              <br><small style="color: #64748b;">Responsável: ${t.responsavel}</small>
            </li>`).join('')
        : '<li><em style="color: #94a3b8;">Nenhuma tarefa pendente para este dia.</em></li>';

      const htmlFinal = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff;">
          <div style="background: #1e293b; color: #fff; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 18px; letter-spacing: 1px;">AGENDA JURÍDICA DIÁRIA</h1>
            <p style="margin: 5px 0 0; opacity: 0.8;">${amanhaInicio.toLocaleDateString('pt-BR')}</p>
          </div>
          
          <div style="padding: 25px;">
            <p>Olá, <b>Dr(a). ${dados.nome}</b>. Este é o seu resumo de atividades para amanhã:</p>
            
            <h3 style="color: #3b82f6; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 30px;">📅 COMPROMISSOS</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">${htmlCompromissos}</ul>
            
            <h3 style="color: #f59e0b; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 30px;">✅ CHECKLIST / PRAZOS</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">${htmlTarefas}</ul>
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px;">
              Este e-mail foi gerado automaticamente pelo seu <b>Nobre Gestor Jurídico</b>.
            </div>
          </div>
        </div>
      `;

      await this.mailService.sendEmail(email, `📅 Agenda: ${amanhaInicio.toLocaleDateString('pt-BR')}`, htmlFinal);
    }
  }
}