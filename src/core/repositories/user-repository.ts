import type { UserCreateInput } from "../../infra/http/schemas/user-schema";


export interface IUserRepository {
  // Usamos 'any' aqui temporariamente para facilitar a persistência, 
  // ou definimos um tipo 'PersistenceUser'
  create(data: UserCreateInput & { senha: string }): Promise<any>; 
  findByEmail(email: string): Promise<any | null>;
  findById(id: string): Promise<any | null>;
}