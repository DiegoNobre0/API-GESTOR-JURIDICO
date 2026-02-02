
import { PasswordHasher } from "../../@shared/password-hasher";
import type { UserCreateInput } from "../../infra/http/schemas/user-schema";
import type { IUserRepository } from "../repositories/user-repository";


export class RegisterUserUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(data: UserCreateInput) {
    const userExists = await this.userRepository.findByEmail(data.email);
    if (userExists) throw new Error("Usuário já cadastrado.");

    const hashedPassword = await PasswordHasher.hash(data.senha);

    return await this.userRepository.create({
      ...data,
      senha: hashedPassword      
    });
  }
}