import type { FastifyInstance } from "fastify";
import { FinanceiroController } from "./financeiro.controller.js";

export async function financeiroModule(app: FastifyInstance) {
  const controller = new FinanceiroController();

  // Criamos um grupo de rotas para aplicar o middleware de segurança
  app.register(async (group) => {
    
    // ESTA LINHA É A CHAVE: Ela chama o seu sistema de login/JWT
    // Garante que req.user NÃO seja null
    group.addHook("preHandler", app.authenticate);

    group.get("/", (req, res) => controller.list(req, res));
    group.get("/resumo", (req, res) => controller.resumo(req, res));
    group.post("/", (req, res) => controller.create(req, res));
    group.delete("/:id", (req, res) => controller.delete(req, res));
    
  }, { prefix: '/financeiro' });
}