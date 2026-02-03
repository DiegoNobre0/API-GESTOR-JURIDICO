import type { FastifyInstance } from "fastify";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PrismaUserRepository } from "../users/repositories/prisma-user.repository.js";
import { prisma } from "@/lib/prisma.js";

export async function authModule(app: FastifyInstance) {
  // 1. Criamos o repositório passando o prisma
  const userRepository = new PrismaUserRepository(prisma);
  
  // 2. Passamos o repositório para o service
  const authService = new AuthService(userRepository);
  const authController = new AuthController(authService);

  app.register(async (group) => {
    group.post("/register", (req, rep) => authController.register(req, rep));
    group.post("/login", (req, rep) => authController.login(req, rep));
  }, { prefix: '/auth' });
}