import 'dotenv/config';
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import multipart from '@fastify/multipart';
import cron from 'node-cron';

// --- IMPORTAÇÕES COM CAMINHOS RELATIVOS (CORRIGIDO) ---
import { prisma } from "./lib/prisma.js"; 
import { MailService } from './infra/services/mail-service.js';

import { authModule } from './modules/auth/auth.module.js';
import { dashboardModule } from './modules/dashboard/dashboard.module.js';
import { processosModule } from './modules/processos/processos.module.js';
import { usersModule } from './modules/users/users.module.js';

// Serviços e Módulos
import { NotifyDailyAgendaService } from './modules/agenda/notify-daily-agenda.service.js';
import { whatsappModule } from './modules/whatsapp/whatsapp.module.js';
import { webhookModule } from './infra/controllers/webhook.module.js';
import { leadsModule } from './modules/leads/leads.module.js';
import { uploadRoutes } from './modules/processos/upload.controller.js';
import { clientesRoutes } from './modules/cliente/clientes.module.js';
import { financeiroModule } from './modules/financeiro/financeiro.module.js';

const app = Fastify({ logger: true });

// --- 1. PLUGINS GLOBAIS ---

app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'secret-2026'
});

app.register(cors, {
  origin: process.env.NODE_ENV === 'production' 
    ? ["https://seu-front-nobre.vercel.app"] 
    : true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
  }
});

app.decorate("authenticate", async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ message: "Sessão expirada ou inválida." });
  }
});

// --- 2. REGISTRO DE MÓDULOS ---
app.register(authModule);
app.register(dashboardModule);
app.register(processosModule);
app.register(financeiroModule);
app.register(usersModule);
app.register(whatsappModule);
app.register(webhookModule);
app.register(leadsModule, { prefix: 'leads' });
app.register(uploadRoutes);
app.register(clientesRoutes, { prefix: 'clientes' });

// Rota de Cron para Vercel
app.get('/api/cron/notify-agenda', async (req, reply) => {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return reply.status(401).send('Não autorizado');
  }

  const mailService = new MailService();
  app.log.info("📅 [CRON] Iniciando notificações...");
  const notifyService = new NotifyDailyAgendaService(mailService);
  await notifyService.execute();
  return { success: true };
});

// --- 3. AGENDADORES (LOCAL APENAS) ---
const mailService = new MailService();

cron.schedule('0 18 * * *', async () => {
  app.log.info("📅 [SCHEDULER] Iniciando notificações de agenda...");
  const notifyService = new NotifyDailyAgendaService(mailService);
  try {
    await notifyService.execute();
  } catch (err : any) {
    app.log.error("❌ Falha no scheduler local:", err);
  }
});

// --- 4. START SERVER (MODO LOCAL) ---
if (process.env.NODE_ENV !== 'production') {
  const start = async () => {
    try {
      await app.listen({ port: 3333, host: '0.0.0.0' });
      console.log("🚀 RCS Advogados - Rodando localmente na porta 3333");
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  };
  start();
}

// --- 5. EXPORT PARA VERCEL ---
export default async (req: any, res: any) => {
  await app.ready();
  app.server.emit('request', req, res);
};