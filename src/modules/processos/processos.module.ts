import type { FastifyInstance } from "fastify";
import { ProcessosService } from "./processos.service.js";
import { createProcessoSchema } from "./dto/create-processo.dto.js";

export async function processosModule(app: FastifyInstance) {
  const service = new ProcessosService();

  app.register(async (group) => {
    group.addHook("preHandler", app.authenticate);

    // Listar Ativos
    group.get("/", async (req) => service.list(req.user.sub, false));

    // Listar Arquivados
    group.get("/arquivados", async (req) => service.list(req.user.sub, true));

    // Buscar por ID
    group.get("/:id", async (req) => service.findById((req.params as any).id, req.user.sub));

    // Salvar Novo
    group.post("/", async (req, rep) => {
      const data = createProcessoSchema.parse(req.body);
      const processo = await service.create(data, req.user.sub);
      return rep.status(201).send(processo);
    });

    // Arquivar/Desarquivar
    group.put("/:id/arquivar", async (req) => service.setArquivado((req.params as any).id, req.user.sub, true));
    group.put("/:id/desarquivar", async (req) => service.setArquivado((req.params as any).id, req.user.sub, false));

  }, { prefix: '/processos' });
}