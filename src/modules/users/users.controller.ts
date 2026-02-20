import { PrismaClient } from "@prisma/client";
import type { IUserRepository } from "./repositories/user.repository.js";



export class UserController implements IUserRepository {
  // Injetamos a instância do Prisma aqui
  constructor(private prisma: PrismaClient) {}

  async create(data: any) {
    return await this.prisma.user.create({ data });
  }

  async findByEmail(email: string) {
    return await this.prisma.user.findUnique({
      where: { email }
    });
  }

  async findById(id: string) {
    return await this.prisma.user.findUnique({
      where: { id }
    });
  }
}