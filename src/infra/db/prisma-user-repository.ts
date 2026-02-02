import { PrismaClient } from "@prisma/client";
import type { IUserRepository } from "../../core/repositories/user-repository";

const prisma = new PrismaClient();

export class PrismaUserRepository implements IUserRepository {
  async create(data: any) {
    return await prisma.user.create({ data });
  }

  async findByEmail(email: string) {
    return await prisma.user.findUnique({
      where: { email }
    });
  }

  async findById(id: string) {
    return await prisma.user.findUnique({
      where: { id }
    });
  }
}