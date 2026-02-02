import { Processo } from "../entities/processo";

export interface IProcessosRepository {
  create(data: any): Promise<any>;
  findByNumero(numero: string): Promise<any | null>;
  listAll(): Promise<any[]>;
  update(id: string, data: any): Promise<any>;
}