import type { FastifyInstance } from "fastify";
import { ProcessosService } from "./processos.service.js";
import { createProcessoSchema } from "./dto/create-processo.dto.js";
import z from "zod";
import { ProcessosController } from "./processos.controller.js";

export async function processosModule(app: FastifyInstance) {
  const service = new ProcessosService();
  const controller = new ProcessosController();

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
      try {
        // Tenta validar
        const data = createProcessoSchema.parse(req.body);
        
        // Se passou, cria
        const processo = await service.create(data, req.user.sub);
        return rep.status(201).send(processo);
      
      } catch (error: any) {
        // Se for erro do Zod ou outro erro de regra
        return rep.status(400).send({ 
          error: "Erro de Validação", 
          details: error.issues || error.message 
        });
      }
    });

    // GET /processos/:id/andamentos
    group.get("/:id/andamentos", async (req, rep) => {
      const { id } = req.params as { id: string };
      const andamentos = await service.listAndamentos(id, req.user.sub);
      return rep.send(andamentos);
    });

    group.put("/:id", async (req, rep) => {
      const { id } = req.params as { id: string };

      // Reutilizamos o schema de criação, mas tornamos tudo opcional (partial)
      // pois na edição podemos mandar só alguns campos
      const body = createProcessoSchema.partial().parse(req.body);

      try {
        const atualizado = await service.update(id, req.user.sub, body);
        return rep.send(atualizado);
      } catch (error: any) {
        return rep.status(400).send({ error: error.message });
      }
    });

    // POST /processos/:id/andamentos
    // Rota: Criar Andamento
    group.post("/:id/andamentos", async (req, rep) => {
      const { id } = req.params as { id: string };

      // Validação do Body
      const bodySchema = z.object({
        tipo: z.string(),     // Front manda "tipo"
        descricao: z.string() // Front manda "descricao"
      });

      const body = bodySchema.parse(req.body);

      const novoAndamento = await service.createAndamento(id, req.user.sub, body);
      return rep.status(201).send(novoAndamento);
    });

    group.post("/gerar-pela-conversa/:id", (req, rep) => controller.gerarPelaConversa(req, rep));
    group.post('/zapsign/gerar', (req, res) => controller.gerarZapSign(req, res));
    // Arquivar/Desarquivar
    group.put("/:id/arquivar", async (req) => service.setArquivado((req.params as any).id, req.user.sub, true));
    group.put("/:id/desarquivar", async (req) => service.setArquivado((req.params as any).id, req.user.sub, false));

  }, { prefix: '/processos' });
}