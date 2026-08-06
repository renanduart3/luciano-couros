import React, { createContext, useContext } from "react";
import { UsuarioSistema } from "../types";

const AuthContext = createContext<UsuarioSistema | null>(null);

export const AuthProvider = AuthContext.Provider;
export function useUsuarioAtual() { return useContext(AuthContext); }
export function useEhGerente() { return useContext(AuthContext)?.perfil === "administrador"; }
