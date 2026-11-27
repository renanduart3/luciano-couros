export type EstadoWhatsApp = "desconectado" | "conectando" | "qr" | "conectado" | "reiniciando";
export type ArquivoWorker = { nome: string; tipo: string; dados: string };
export type PedidoWorker =
  | { tipo: "conectar" }
  | { tipo: "limpar" }
  | { tipo: "enviar"; id: number; numero: string; legenda: string; arquivo: ArquivoWorker };
export type RespostaWorker =
  | { tipo: "estado"; estado: EstadoWhatsApp; numero?: string; qr?: string; erro?: string }
  | { tipo: "resultado"; id: number; ok: boolean; erro?: string };
