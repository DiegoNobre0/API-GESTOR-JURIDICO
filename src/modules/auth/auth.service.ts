

import type { LoginInput } from "./dto/login.dto.js";
import type { IUserRepository } from "../users/repositories/user.repository.js";
import { PasswordHasher } from "../../shared/password-hasher.js";

export class AuthService {
  constructor(private userRepository: IUserRepository) {}

  async login(data: LoginInput) {
    const user = await this.userRepository.findByEmail(data.email);
    if (!user) throw new Error("E-mail ou senha incorretos.");

    const passwordMatch = await PasswordHasher.compare(data.senha, user.senha);
    if (!passwordMatch) throw new Error("E-mail ou senha incorretos.");

    const { senha: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async register(data: any) {
    const userExists = await this.userRepository.findByEmail(data.email);
    if (userExists) throw new Error("Usuário já cadastrado.");

    const hashedPassword = await PasswordHasher.hash(data.senha);

    const user = await this.userRepository.create({
      ...data,
      senha: hashedPassword      
    });

    const { senha: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}