
import { PasswordHasher } from "../../@shared/password-hasher";
import type { LoginInput } from "../../infra/http/schemas/auth-schema";
import type { IUserRepository } from "../repositories/user-repository";


export class LoginUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(data: LoginInput) {
    // 1. Busca o usuário pelo e-mail
    const user = await this.userRepository.findByEmail(data.email);
    if (!user) {
      throw new Error("E-mail ou senha incorretos.");
    }

    // 2. Compara o hash da senha usando bcrypt
    const passwordMatch = await PasswordHasher.compare(data.senha, user.senha);
    if (!passwordMatch) {
      throw new Error("E-mail ou senha incorretos.");
    }

    // Retorna os dados do usuário (removendo a senha por segurança)
    const { senha: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}