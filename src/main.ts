import 'dotenv/config';
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import multipart from '@fastify/multipart';
import cron from 'node-cron';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// --- IMPORTAÇÕES INTERNAS ---
import { MailService } from './infra/services/mail-service.js';
import { NotifyDailyAgendaService } from './modules/agenda/notify-daily-agenda.service.js';

// 👇 AQUI ESTÁ O SEGREDO: Importar o arquivo do cron do Datajud
// (Ajuste o caminho para onde o seu arquivo datajud.cron.ts realmente está)
import '../src/infra/services/CronJob.service.js'; 
import { CronJobService } from './infra/services/CronJob.service.js';
// --- IMPORTAÇÕES DE MÓDULOS ---
import { authModule } from './modules/auth/auth.module.js';
import { dashboardModule } from './modules/dashboard/dashboard.module.js';
import { processosModule } from './modules/processos/processos.module.js';
import { usersModule } from './modules/users/users.module.js';
import { whatsappModule } from './modules/whatsapp/whatsapp.module.js';
import { webhookModule } from './infra/controllers/webhook.module.js';
import { leadsModule } from './modules/leads/leads.module.js';
import { uploadRoutes } from './modules/processos/upload.controller.js';
import { clientesRoutes } from './modules/cliente/clientes.module.js';
import { financeiroModule } from './modules/financeiro/financeiro.module.js';
import { agendaRoutes } from './modules/agenda/agenda.routes.js';
import { verificarFallbacks } from './infra/workers/fallback.worker.js';
import { fallbackModule } from './infra/workers/fallback.routes.js';

const app = Fastify({ logger: true });

/* =======================================================
   1️⃣ PLUGINS
======================================================= */
app.register(fastifyJwt, { secret: process.env.JWT_SECRET || 'secret-2026' });

app.register(cors, {
  origin: process.env.NODE_ENV === 'production' ? ["https://gestor-juridico-front.vercel.app"] : true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

app.decorate("authenticate", async (request: any, reply: any) => {
  try { await request.jwtVerify(); } 
  catch { reply.status(401).send({ message: "Sessão expirada ou inválida." }); }
});

/* =======================================================
   2️⃣ MÓDULOS (ROTAS)
======================================================= */
app.register(authModule);
app.register(dashboardModule);
app.register(processosModule);
app.register(financeiroModule);
app.register(usersModule);
app.register(whatsappModule);
app.register(webhookModule);
app.register(leadsModule, { prefix: 'leads' });
app.register(uploadRoutes);
app.register(agendaRoutes);
app.register(clientesRoutes, { prefix: 'clientes' });
app.register(fallbackModule)

/* =======================================================
   3️⃣ JOBS AGENDADOS (CRON)
======================================================= */
const mailService = new MailService();

// 🕒 ROTINA 1: Resumo da Agenda (Todo dia às 18:00)
cron.schedule('0 18 * * *', async () => {
  app.log.info("📅 [CRON] Iniciando notificações de agenda (18h00)...");
  const notifyService = new NotifyDailyAgendaService(mailService);
  try {
    await notifyService.execute();
    app.log.info("✅ [CRON] Notificações de agenda enviadas.");
  } catch (err: any) {
    app.log.error("❌ Falha no cron de agenda:", err);
  }
});

// A ROTINA 2 (Datajud) já foi ativada automaticamente lá no topo do arquivo 
const cronJobService = new CronJobService();
cronJobService.iniciarAgendamento();

/* =======================================================
   4️⃣ START SERVER COM SOCKET (VPS)
======================================================= */
async function start() {
  try {
    const io = new SocketIOServer(app.server, {
      cors: { origin: '*' },
    });

    app.decorate('io', io);

    io.on('connection', (socket) => {
      console.log('🟢 Cliente conectado ao Socket:', socket.id);
      socket.on('disconnect', () => {
        console.log('🔴 Cliente desconectado do Socket:', socket.id);
      });
    });

    

    await app.listen({ port: 3333, host: '0.0.0.0' });
    console.log("🚀 Nobre Gestão Jurídica rodando com Socket na porta 3333");

  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// 🔁 Scheduler de Fallback
setInterval(async () => {
  try {
    console.log("⏱️ Verificando fallbacks...")
    await verificarFallbacks()
  } catch (err) {
    console.error("Erro no fallback worker:", err)
  }
}, 1000 * 60 * 5) // a cada 5 minutos

start();