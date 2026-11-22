import { z } from "zod";

export const regrasSchema = z
  .object({
    periodicidade: z.number().int().min(1).max(365),
    atraso: z.number().int().min(0).max(3650),
    minimo: z.number().min(0).max(999999999),
    observacao: z.string().trim().max(500),
  })
  .strict();
export type Regras = z.infer<typeof regrasSchema>;
export const regrasIniciais: Regras = { periodicidade: 7, atraso: 0, minimo: 0, observacao: "" };
export const camposRegras = {
  periodicidade: "Intervalo entre avisos (dias)",
  atraso: "Cobrar após mais de quantos dias de atraso?",
  minimo: "Saldo vencido mínimo por cliente (R$)",
  observacao: "Orientação ao vendedor (opcional)",
} satisfies Record<keyof Regras, string>;

export const canais = ["waha", "telegram"] as const;
export type Canal = (typeof canais)[number];
export const destinatarioSchema = z
  .object({
    id: z.string().min(1),
    waha: z.string().regex(/^(?:[1-9]\d{7,14})?$/),
    telegram: z.string().regex(/^(?:[1-9]\d{0,15})?$/),
  })
  .strict();
export type Destinatario = z.infer<typeof destinatarioSchema> & { nome: string; perfil: string };
export const centralSchema = z
  .object({
    ativo: z.boolean(),
    canal: z.enum(canais),
    horario: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    regras: regrasSchema,
  })
  .strict();
export type Central = z.infer<typeof centralSchema>;
export const centralInicial: Central = {
  ativo: false,
  canal: "waha",
  horario: "09:00",
  regras: regrasIniciais,
};
export interface PainelAutomacao {
  central: Central;
  excecoes?: Partial<Regras>;
  vendedores?: Destinatario[];
  destinatarios?: string[] | null;
  administradorPadrao?: string;
  historico?: {
    id: number;
    dia: string;
    cliente: string;
    vendedor: string;
    canal: Canal;
    estado: string;
    detalhe: string;
  }[];
}
