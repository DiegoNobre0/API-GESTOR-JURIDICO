
import type { FastifyInstance } from "fastify";
import { ClientesController } from "./clientes.controller.js";

export async function clientesRoutes(app: FastifyInstance) {
  const controller = new ClientesController();

  // Middleware de Autenticação (se você usar JWT, descomente abaixo)
  // app.addHook("preHandler", app.authenticate);

  app.get("/:id", async (req, rep) => controller.getById(req, rep));
  app.put("/:id", async (req, rep) => controller.update(req, rep));
  app.get("/", async (req, rep) => controller.list(req, rep));
}