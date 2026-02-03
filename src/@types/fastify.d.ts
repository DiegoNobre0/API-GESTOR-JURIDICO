import '@fastify/jwt';


declare module 'fastify' {
  export interface FastifyInstance {
    // Adicionamos a assinatura do método authenticate que usaremos nas rotas
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // Define o formato do objeto que o request.user terá
    user: {
      sub: string;    // ID do Usuário no Prisma
      nome: string;   // Nome do Dr. Diego ou Cliente
      email: string;
      tipo: 'advogado_admin' | 'advogado' | 'cliente';// Diferenciação de acesso
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    io: Server; // Aqui você avisa ao TS que o .io existe e é um Server do Socket.io
  }
}