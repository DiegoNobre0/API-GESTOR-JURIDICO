import 'fastify';
import '@fastify/jwt';
import { Server as SocketIOServer } from 'socket.io';
import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    io: SocketIOServer;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      sub: string;
      nome: string;
      email: string;
      tipo: 'advogado_admin' | 'advogado' | 'cliente';
    };
  }
}
