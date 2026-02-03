import type { FastifyInstance } from "fastify";
import { FinanceiroService } from "./financeiro.service.js";
import { createFinanceiroSchema } from "./dto/create-financeiro.dto.js";

export async function financeiroModule(app: FastifyInstance) {
  const service = new FinanceiroService();

  app.register(async (group) => {
    // Garante que apenas usuários autenticados acessem o financeiro
    group.addHook("preHandler", app.authenticate);

    // GET /financeiro -> listarTransacoes()
    group.get("/", async (req) => service.list(req.user.sub));

    // POST /financeiro -> salvarTransacao()
    group.post("/", async (req, rep) => {
      const data = createFinanceiroSchema.parse(req.body);
      const res = await service.create(data, req.user.sub);
      return rep.status(201).send(res);
    });

    // PUT /financeiro/:id/arquivar -> arquivarTransacao()
    group.put("/:id/arquivar", async (req) => {
      const { id } = req.params as any;
      return service.setArquivado(id, req.user.sub, true);
    });

    // DELETE /financeiro/:id -> excluirTransacao()
    // Ajustado para chamar o service.delete e evitar o erro de 'Cannot find name prisma'
    group.delete("/:id", async (req, rep) => {
      const { id } = req.params as any;
      await service.delete(id, req.user.sub);
      return rep.status(204).send(); // Retorno limpo para o Angular
    });

  }, { prefix: '/financeiro' });
}