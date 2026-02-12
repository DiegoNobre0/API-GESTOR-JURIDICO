import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "./auth.service.js";
import { userCreateSchema } from "../../modules/users/dto/user.dto.js"; // Alias ajustado
import { loginSchema } from "./dto/login.dto.js";

export class AuthController {
  constructor(private authService: AuthService) {}

  async register(request: FastifyRequest, reply: FastifyReply) {
    const data = userCreateSchema.parse(request.body);
    try {
      const user = await this.authService.register(data);
      return reply.status(201).send({ 
        id: user.id, 
        nome: user.nome, 
        email: user.email, 
        tipo: user.tipo 
      });
    } catch (error: any) {
      return reply.status(400).send({ message: error.message });
    }
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    const data = loginSchema.parse(request.body);
    try {
      const user = await this.authService.login(data);

      const token = await reply.jwtSign(
        { nome: user.nome, tipo: user.tipo, email: user.email },
        { sign: { sub: user.id, expiresIn: '7d' } }
      );

      return reply.send({
        user: { 
          id: user.id, 
          nome: user.nome, 
          email: user.email, 
          tipo: user.tipo 
        },
        access_token: token,
        token_type: "bearer"
      });
    } catch (error: any) {
      return reply.status(401).send({ message: error.message });
    }
  }
}