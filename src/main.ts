import 'dotenv/config';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import cron from 'node-cron'; //

// Importações dos Repositórios e Use Cases
import { PrismaProcessosRepository } from "./infra/db/prisma-processos-repository";
import { CreateProcessoUseCase } from "./core/use-cases/create-processo";
import { ProcessoController } from "./infra/http/controllers/processo-controller";
import { PrismaUserRepository } from './infra/db/prisma-user-repository';
import { RegisterUserUseCase } from './core/use-cases/register-user';
import { LoginUseCase } from './core/use-cases/login-user';
import { AuthController } from './infra/http/controllers/auth-controller';
import { PrismaTransacaoRepository } from './infra/db/prisma-transacao-repository';
import { RegisterTransacaoUseCase } from './core/use-cases/register-transacao';
import { GetDashboardStatsUseCase } from './core/use-cases/get-dashboard-stats';

// Novos Serviços para automação
import { AstreaScraper } from './infra/services/astrea-scraper';
import { SyncAstreaUseCase } from './core/use-cases/sync-astrea';
import { MailService } from './infra/services/mail-service';
import { ChatbotService } from './infra/services/chatbot-service';
import { PrismaAgendaRepository } from './infra/db/prisma-agenda-repository';
import { ManageAgendaUseCase } from './core/use-cases/manage-agenda';
import { createCompromissoSchema, createTarefaSchema } from './infra/http/schemas/agenda-schema';
import { NotifyDailyAgendaUseCase } from './core/use-cases/notify-daily-agenda';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: any; 
  }
}

const app: FastifyInstance = Fastify({ logger: true });

app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'secret-2026'
});

app.register(cors, { origin: true });

app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    console.log("Header recebido:", request.headers.authorization);
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

// --- COMPOSITION ROOT (Injeção de Dependências) ---
const userRepository = new PrismaUserRepository();
const registerUserUseCase = new RegisterUserUseCase(userRepository);
const loginUseCase = new LoginUseCase(userRepository);
const authController = new AuthController(registerUserUseCase, loginUseCase);

const repository = new PrismaProcessosRepository();
const createProcessoUseCase = new CreateProcessoUseCase(repository);
const controller = new ProcessoController(createProcessoUseCase);

const transacaoRepo = new PrismaTransacaoRepository();
const registerTransacao = new RegisterTransacaoUseCase(transacaoRepo);
const getDashboard = new GetDashboardStatsUseCase();

// Instâncias para o Scheduler
const mailService = new MailService();
const notifyDailyAgenda = new NotifyDailyAgendaUseCase(mailService);
const chatbotService = new ChatbotService(registerTransacao);
const astreaScraper = new AstreaScraper(process.env.ASTREA_EMAIL!, process.env.ASTREA_PASSWORD!);
const syncAstreaUseCase = new SyncAstreaUseCase(astreaScraper, repository);
const agendaRepo = new PrismaAgendaRepository();
const manageAgenda = new ManageAgendaUseCase(agendaRepo);


// --- ROTA DE TESTE DE E-MAIL ---

// 1. Teste de Conexão Pura (SMTP)
app.post("/api/test-smtp", { preHandler: [app.authenticate] }, async (req, res) => {
  const userEmail = (req.user as any).email; // Pega o e-mail do usuário logado
  
  try {
    await mailService.sendEmail(
      userEmail, 
      "🚀 Teste de Conexão SMTP - RCS Assistant", 
      "<h1>Funciona!</h1><p>Se você recebeu isso, sua configuração de e-mail está perfeita.</p>"
    );
    return res.send({ message: "E-mail de teste enviado para " + userEmail });
  } catch (err: any) {
    return res.status(500).send({ error: "Falha no SMTP", detail: err.message });
  }
});

// 2. Teste da Lógica de Agenda (Forçar disparo do Use Case)
app.post("/api/test-agenda-email", { preHandler: [app.authenticate] }, async (req, res) => {
  try {
    console.log("📨 Disparando Use Case de Agenda manualmente...");
    await notifyDailyAgenda.execute();
    return res.send({ message: "Processamento de agenda concluído. Verifique os e-mails enviados." });
  } catch (err: any) {
    return res.status(500).send({ error: "Erro no processamento da agenda", detail: err.message });
  }
});

// --- ROTAS ---
app.post("/api/auth/register", (req, res) => authController.register(req, res));
app.post("/api/auth/login", (req, res) => authController.login(req, res));

app.post("/api/processos", { preHandler: [app.authenticate] }, (request, reply) => controller.create(request, reply));

app.post("/api/transacoes", { preHandler: [app.authenticate] }, async (req, res) => {
  const userId = (req.user as any).sub;
  const data = await registerTransacao.execute(req.body as any, userId);
  return res.send(data);
});


// --- ROTAS DE AGENDA & TAREFAS ---

// Listar tudo (Agenda + Tarefas Pendentes)
app.get("/api/agenda", { preHandler: [app.authenticate] }, async (req, res) => {
  const userId = (req.user as any).sub;
  const data = await manageAgenda.fetchAll(userId);
  return res.send(data);
});

// Criar Compromisso
app.post("/api/agenda/compromissos", { preHandler: [app.authenticate] }, async (req, res) => {
  const userId = (req.user as any).sub;
  const body = createCompromissoSchema.parse(req.body);
  const result = await manageAgenda.addCompromisso(body, userId);
  return res.status(201).send(result);
});

// Criar Tarefa
app.post("/api/agenda/tarefas", { preHandler: [app.authenticate] }, async (req, res) => {
  const userId = (req.user as any).sub;
  const body = createTarefaSchema.parse(req.body);
  const result = await manageAgenda.addTarefa(body, userId);
  return res.status(201).send(result);
});

// Marcar Tarefa como Concluída
app.patch("/api/agenda/tarefas/:id/complete", { preHandler: [app.authenticate] }, async (req, res) => {
  const { id } = req.params as { id: string };
  await agendaRepo.completeTarefa(id);
  return res.send({ message: "Tarefa concluída!" });
});

app.post("/api/chatbot", { preHandler: [app.authenticate] }, async (req, res) => {
  const { message } = req.body as { message: string };
  const userId = (req.user as any).sub; // Pega o ID do usuário do token JWT

  try {
    const response = await chatbotService.chat(message, userId);
    return res.send({ response });
  } catch (err: any) {
    return res.status(500).send({ error: "Erro ao processar sua solicitação na IA." });
  }
});

// --- AGORA (Ajustado para o seu DashboardService) ---
app.get("/api/dashboard/stats", { preHandler: [app.authenticate] }, async (req, res) => {
  try {
    const data = await getDashboard.execute();
    return res.send(data);
  } catch (err: any) {
    app.log.error(err);
    return res.status(500).send({ error: "Erro ao buscar estatísticas do dashboard" });
  }
});

// 1. Verificação de Agenda (Diário às 18:00) para enviar alertas de amanhã
cron.schedule('0 18 * * *', async () => {
  console.log("⏰ [SCHEDULER] Iniciando verificação de agenda para amanhã...");
  try {
    // Executa a busca no MongoDB e envia os e-mails consolidados
    await notifyDailyAgenda.execute(); 
    console.log("✅ [SCHEDULER] Notificações de agenda enviadas com sucesso.");
  } catch (err) {
    console.error("❌ Erro no scheduler de agenda:", err);
  }
});

// 2. Verificação de PJE/Astrea (Diário às 07:00)
cron.schedule('0 7 * * *', async () => {
  console.log("⚖️ [SCHEDULER] Iniciando sincronização matinal com Astrea...");
  try {
    // Aqui roda o scraper que entra no Astrea, lê os andamentos e salva no MongoDB
    const result = await syncAstreaUseCase.execute();
    console.log(`✅ Sincronização concluída: ${result.atualizados} processos atualizados.`);
    
    // Opcional: Notificar o administrador caso ocorra alguma falha crítica no scraper
  } catch (err : any) {
    console.error("❌ Erro no scheduler do Astrea:", err);
    // Envia um e-mail de alerta para você caso o scraper falhe (ex: mudança no site do Astrea)
    await mailService.sendEmail(
      process.env.ADMIN_EMAIL || '', 
      "🚨 Falha na Sincronização Astrea", 
      `<p>Ocorreu um erro ao rodar o scraper matinal: ${err.message}</p>`
    );
  }
});

const start = async () => {
  try {
    await app.listen({ port: 3333, host: '0.0.0.0' }); 
    console.log("🚀 Backend Jurídico rodando em http://localhost:3333");
    console.log("📅 Agendadores automáticos ativos (07:00 e 18:00)"); //
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();