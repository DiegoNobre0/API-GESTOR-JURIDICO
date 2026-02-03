import type { UserCreateInput } from "../dto/user.dto.js";


export interface IUserRepository {
  create(data: UserCreateInput & { senha: string }): Promise<any>;
  findByEmail(email: string): Promise<any | null>;
  findById(id: string): Promise<any | null>;
}