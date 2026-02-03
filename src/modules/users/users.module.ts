import type { FastifyInstance } from "fastify";
import { UsersService } from "./users.service.js";

export async function usersModule(app: FastifyInstance) {
  const service = new UsersService();

  app.register(async (group) => {
    // Todas as rotas de usuários exigem login
    group.addHook("preHandler", app.authenticate);

    // GET /users/me -> Busca dados do usuário logado (Token JWT)
    group.get("/me", async (req) => {
      return service.getProfile(req.user.sub);
    });

    // GET /users -> Lista todos (para gestão interna)
    group.get("/", async (req, rep) => {
      // Opcional: Validar se quem está pedindo é admin
      if (req.user.tipo !== 'advogado_admin') {
        return rep.status(403).send({ message: "Acesso negado." });
      }
      return service.listAll();
    });

    // GET /users/lawyers -> Para preencher o campo 'responsável' no Angular
    group.get("/lawyers", async () => service.listLawyers());

  }, { prefix: '/users' });
}