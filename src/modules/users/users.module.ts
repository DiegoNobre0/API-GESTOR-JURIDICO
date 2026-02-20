import type { FastifyInstance } from "fastify";
import { UsersService } from "./users.service.js";
import { userCreateSchema, userUpdateSettingsSchema } from "./dto/user.dto.js";

export async function usersModule(app: FastifyInstance) {
  const service = new UsersService();

  app.register(async (group) => {
    // Todas as rotas de usuários exigem login
    group.addHook("preHandler", app.authenticate);

    // ==========================================
    // DADOS DO PRÓPRIO USUÁRIO LOGADO
    // ==========================================

    // GET /users/me -> Busca dados principais do usuário logado (Token JWT)
    group.get("/me", async (req) => {
      return service.getProfile(req.user.sub);
    });

    // GET /users/me/settings -> Busca configurações detalhadas (Aba 1)
    group.get("/me/settings", async (req) => {
      return service.getSettings(req.user.sub);
    });

    // PUT /users/me/settings -> Salva as configurações do usuário logado (Aba 1)
    group.put("/me/settings", async (req, rep) => {
      const data = userUpdateSettingsSchema.parse(req.body);
      const updatedUser = await service.updateSettings(req.user.sub, data);
      return rep.send(updatedUser);
    });


    // ==========================================
    // GERENCIAMENTO DE EQUIPE (ADMIN/SÓCIO)
    // ==========================================

    // ✅ NOVA ROTA: POST /users -> Cria um novo membro na equipe
    group.post("/", async (req, rep) => {
      // Trava de Segurança: Só Admin pode criar outros advogados/admins
      if (req.user.tipo !== 'advogado_admin') {
        return rep.status(403).send({ message: "Acesso negado. Apenas Sócios podem adicionar membros." });
      }

      try {
        // Valida os dados usando o Zod
        const data = userCreateSchema.parse(req.body);
        
        // Cria o usuário
        const newUser = await service.createUser(data);
        return rep.status(201).send(newUser);
        
      } catch (error: any) {
        return rep.status(400).send({ message: error.message });
      }
    });

    // GET /users/team -> Lista advogados e admins (Aba 2)
    group.get("/team", async (req, rep) => {
      if (req.user.tipo !== 'advogado_admin') {
        return rep.status(403).send({ message: "Acesso negado." });
      }
      return service.listTeam();
    });

    // PUT /users/team/:id -> Edita um membro da equipe
    group.put<{ Params: { id: string } }>("/team/:id", async (req, rep) => {
      if (req.user.tipo !== 'advogado_admin') {
        return rep.status(403).send({ message: "Acesso negado." });
      }
      const data = req.body; 
      return service.updateTeamMember(req.params.id, data);
    });

    // DELETE /users/team/:id -> Exclui um membro da equipe
    group.delete<{ Params: { id: string } }>("/team/:id", async (req, rep) => {
      if (req.user.tipo !== 'advogado_admin') {
        return rep.status(403).send({ message: "Acesso negado." });
      }
      return service.deleteTeamMember(req.params.id);
    });


    // ==========================================
    // ROTAS AUXILIARES E GERAIS
    // ==========================================

    // GET /users -> Lista todos os usuários (Advogados e Clientes)
    group.get("/", async (req, rep) => {
      if (req.user.tipo !== 'advogado_admin') {
        return rep.status(403).send({ message: "Acesso negado." });
      }
      return service.listAll();
    });

    // GET /users/lawyers -> Para preencher select de 'Responsável' no Angular
    group.get("/lawyers", async () => {
      return service.listLawyers();
    });

  }, { prefix: '/users' });
}