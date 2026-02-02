import type { FastifyReply, FastifyRequest } from "fastify";
import { RegisterUserUseCase } from "../../../core/use-cases/register-user";
import { LoginUseCase } from "../../../core/use-cases/login-user";
import { userCreateSchema } from "../schemas/user-schema";
import { loginSchema } from "../schemas/auth-schema";

export class AuthController {
  constructor(
    private registerUseCase: RegisterUserUseCase,
    private loginUseCase: LoginUseCase
  ) {}

  async register(request: FastifyRequest, reply: FastifyReply) {
    const data = userCreateSchema.parse(request.body);
    try {
      const user = await this.registerUseCase.execute(data);
      return reply.status(201).send({ id: user.id, nome: user.nome, email: user.email });
    } catch (error: any) {
      return reply.status(400).send({ message: error.message });
    }
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    const data = loginSchema.parse(request.body);
    try {
      const user = await this.loginUseCase.execute(data);

      // Gera o Token JWT contendo o ID e o Tipo do usuário
      const token = await reply.jwtSign(
        { nome: user.nome, tipo: user.tipo, email: user.email },
        { sign: { sub: user.id, expiresIn: '7d' } } // Expiração de 7 dias
      );

      return reply.send({
        user: { id: user.id, nome: user.nome, email: user.email, tipo: user.tipo },
        access_token: token,
        token_type: "bearer"
      });
    } catch (error: any) {
      return reply.status(401).send({ message: error.message });
    }
  }
}