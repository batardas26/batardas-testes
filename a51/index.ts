// BATARDAS · R3.2.2 — gestão segura de utilizadores e primeiro acesso.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DOMINIO_LOGIN = "login.batardas.interno";
const AREAS = new Set(["producao", "armazem", "qualidade", "manutencao", "administracao"]);
const NIVEIS = new Set(["consulta", "operador", "responsavel", "admin"]);
const PERFIS_BASE = new Set(["super_admin", "administracao", "responsavel_producao", "operador_producao", "armazem_embalamento", "qualidade", "manutencao", "compras", "logistica_expedicao", "consulta_direcao"]);
const PERFIL_BASE_POR_ROLE: Record<string, string> = {
  admin: "administracao", producao: "operador_producao", armazem: "armazem_embalamento",
  qualidade: "qualidade", manutencao: "manutencao", consulta: "consulta_direcao",
};

function chaveAdministrativa(): string {
  let chaves: unknown;
  try {
    chaves = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  } catch { throw new Error("Configuração SUPABASE_SECRET_KEYS inválida."); }
  if (chaves && typeof chaves === "object" && !Array.isArray(chaves)) {
    const valor = (chaves as Record<string, unknown>).default;
    if (typeof valor === "string" && valor.trim()) return valor;
  }
  throw new Error('Secret key "default" não disponível em SUPABASE_SECRET_KEYS.');
}

const admin = createClient(SUPABASE_URL, chaveAdministrativa(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function origemPermitida(req: Request): string | null {
  const origem = req.headers.get("Origin");
  if (!origem) return null;
  const permitidas = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "https://batardas26.github.io")
    .split(",").map((v) => v.trim()).filter(Boolean);
  return permitidas.includes(origem) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem) ? origem : null;
}

function headers(req: Request): Record<string, string> {
  const origem = origemPermitida(req);
  return {
    ...(origem ? { "Access-Control-Allow-Origin": origem, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };
}

const resposta = (req: Request, corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: headers(req) });

function passwordTemporaria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alfabeto[b % alfabeto.length]).join("");
}

function passwordForte(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length >= 8 && valor.length <= 128
    && /[a-z]/.test(valor) && /[A-Z]/.test(valor) && /\d/.test(valor) && /[^A-Za-z0-9]/.test(valor);
}

async function evento(tipo: string, autor: string, alvo?: string, detalhes: Record<string, unknown> = {}) {
  const { error } = await admin.from("eventos_seguranca_r322").insert({
    tipo, perfil_id: autor, entidade_id: alvo ?? null, detalhes,
  });
  if (error && error.code !== "42P01") console.error("Falha no registo de segurança", error.code);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("Origin") && !origemPermitida(req)) return resposta(req, { error: "Origem não autorizada" }, 403);
    return new Response(null, { status: 204, headers: headers(req) });
  }
  if (req.method !== "POST") return resposta(req, { error: "Método não permitido" }, 405);
  if (req.headers.get("Origin") && !origemPermitida(req)) return resposta(req, { error: "Origem não autorizada" }, 403);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return resposta(req, { error: "Não autenticado" }, 401);

  const cliente = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: erroUser } = await cliente.auth.getUser();
  if (erroUser || !user) return resposta(req, { error: "Sessão inválida" }, 401);
  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return resposta(req, { error: "Pedido inválido" }, 400); }
  const acao = String(corpo.acao ?? "");
  const { data: perfil, error: erroPerfil } = await admin.from("perfis")
    .select("role,super_admin,deve_alterar_password").eq("id", user.id).single();
  if (erroPerfil || !perfil) return resposta(req, { error: "Perfil não configurado" }, 403);

  // Única ação permitida antes de haver acesso operacional. O browser nunca
  // pode limpar diretamente os dois marcadores de primeiro acesso.
  if (acao === "concluir_primeiro_acesso") {
    if (!perfil.deve_alterar_password && user.user_metadata?.deve_alterar_password !== true)
      return resposta(req, { error: "O primeiro acesso já foi concluído" }, 409);
    if (!passwordForte(corpo.password))
      return resposta(req, { error: "Use 8 ou mais caracteres, com maiúscula, minúscula, número e símbolo" }, 400);
    const { error: erroAuth } = await admin.auth.admin.updateUserById(user.id, {
      password: corpo.password,
      user_metadata: { ...(user.user_metadata ?? {}), deve_alterar_password: false },
    });
    if (erroAuth) return resposta(req, { error: "Não foi possível guardar a nova palavra-passe" }, 400);
    const { error } = await admin.from("perfis").update({ deve_alterar_password: false }).eq("id", user.id);
    if (error) return resposta(req, { error: "Palavra-passe alterada; volte a entrar para concluir o acesso" }, 409);
    await evento("PRIMEIRO_ACESSO_CONCLUIDO", user.id, user.id);
    return resposta(req, { ok: true });
  }

  if (perfil.role !== "admin") return resposta(req, { error: "Só administradores podem gerir utilizadores" }, 403);
  if (acao === "listar_utilizadores") {
    const { data, error } = await admin.from("perfis")
      .select("id,nome,role,super_admin,nome_utilizador,email_contacto,perfil_base_codigo,estado_utilizador_a53,perfil_completo,deve_alterar_password,funcao_a54,equipa_codigo_a54,responsavel_id_a54,data_aniversario,foto_caminho").order("nome");
    if (error) return resposta(req, { error: "Não foi possível listar os utilizadores" }, 400);
    const ids = (data ?? []).map((item) => item.id);
    const [{ data: capacidades }, { data: acessos }] = await Promise.all([
      admin.from("capacidades_perfil_r32").select("perfil_id,capacidade").in("perfil_id", ids),
      admin.from("acessos_area_r31").select("perfil_id,area,nivel,valido_desde,valido_ate").in("perfil_id", ids),
    ]);
    return resposta(req, { utilizadores: (data ?? []).map((item) => ({
      ...item,
      capacidades: (capacidades ?? []).filter((c) => c.perfil_id === item.id).map((c) => c.capacidade),
      acessos_area: (acessos ?? []).filter((a) => a.perfil_id === item.id),
    })) });
  }

  if (acao === "listar_configuracao_utilizadores") {
    const [{ data: perfisBase, error: erroPerfis }, { data: capacidades, error: erroCapacidades }, { data: equipas, error: erroEquipas }] = await Promise.all([
      admin.from("perfis_base_a52").select("codigo,nome,role_legado,ordem").eq("ativo", true).order("ordem"),
      admin.from("catalogo_capacidades_a53").select("codigo,nome,area,ordem").eq("ativa", true).order("ordem"),
      admin.from("equipas_a54").select("codigo,nome,area,ordem").eq("ativa",true).order("ordem"),
    ]);
    if (erroPerfis || erroCapacidades || erroEquipas) return resposta(req, { error: "Não foi possível carregar a configuração" }, 400);
    return resposta(req, { perfisBase, capacidades, equipas });
  }

  if (acao === "criar_utilizador") {
    if (!perfil.super_admin) return resposta(req, { error: "Só o super admin pode criar utilizadores novos" }, 403);
    const nomeUtilizador = String(corpo.nomeUtilizador ?? "").trim().toLowerCase();
    const nome = String(corpo.nome ?? "").trim();
    const role = String(corpo.role ?? "");
    const perfilBaseCodigo = String(corpo.perfilBaseCodigo ?? PERFIL_BASE_POR_ROLE[role] ?? "");
    const permissoes = corpo.permissoesOperacionais;
    const capacidades = Array.isArray(corpo.capacidades) ? [...new Set(corpo.capacidades.map(String))] : [];
    if (!nome || !/^[a-z0-9._-]+$/.test(nomeUtilizador) || !Array.isArray(permissoes) || !PERFIS_BASE.has(perfilBaseCodigo))
      return resposta(req, { error: "Dados do utilizador inválidos" }, 400);
    const porArea = new Map<string, string>();
    for (const item of permissoes as Array<Record<string, unknown>>) {
      const area = String(item.area ?? ""), nivel = String(item.nivel ?? "");
      if (!AREAS.has(area) || !NIVEIS.has(nivel)) return resposta(req, { error: "Área ou nível operacional inválido" }, 400);
      porArea.set(area, nivel);
    }
    const password = passwordTemporaria();
    const { data: novo, error: erroCriar } = await admin.auth.admin.createUser({
      email: `${nomeUtilizador}@${DOMINIO_LOGIN}`, password, email_confirm: true,
      user_metadata: { deve_alterar_password: true },
    });
    if (erroCriar || !novo.user) return resposta(req, { error: "Não foi possível criar o utilizador" }, 400);
    const { error: erroInsert } = await admin.from("perfis").insert({
      id: novo.user.id, nome, role, super_admin: false, nome_utilizador: nomeUtilizador,
      email_contacto: String(corpo.emailContacto ?? "").trim() || null,
      perfil_completo: false, deve_alterar_password: true, perfil_base_codigo: perfilBaseCodigo,
      estado_utilizador_a53: "ativo",
    });
    if (erroInsert) {
      await admin.auth.admin.deleteUser(novo.user.id);
      return resposta(req, { error: "Não foi possível concluir a criação do utilizador" }, 400);
    }
    if (porArea.size) {
      const acessos = [...porArea].map(([area, nivel]) => ({ perfil_id: novo.user!.id, area, nivel, atribuido_por: user.id }));
      const { error } = await admin.from("acessos_area_r31").upsert(acessos, { onConflict: "perfil_id,area" });
      if (error) {
        await admin.auth.admin.deleteUser(novo.user.id);
        return resposta(req, { error: "Não foi possível atribuir as permissões" }, 400);
      }
    }
    if (capacidades.length) {
      const { data: permitidas } = await admin.from("catalogo_capacidades_a53").select("codigo").eq("ativa", true).in("codigo", capacidades);
      if ((permitidas ?? []).length !== capacidades.length) {
        await admin.auth.admin.deleteUser(novo.user.id);
        return resposta(req, { error: "Capacidade adicional inválida" }, 400);
      }
      const { error } = await admin.from("capacidades_perfil_r32").insert(capacidades.map((capacidade) => ({ perfil_id: novo.user!.id, capacidade })));
      if (error) {
        await admin.auth.admin.deleteUser(novo.user.id);
        return resposta(req, { error: "Não foi possível atribuir as capacidades" }, 400);
      }
    }
    await evento("UTILIZADOR_CRIADO", user.id, novo.user.id, { role, perfilBaseCodigo, areas: [...porArea.keys()] });
    return resposta(req, { ok: true, password, nomeUtilizador });
  }

  if (acao === "atualizar_utilizador") {
    if (!perfil.super_admin) return resposta(req, { error: "Só o super admin pode alterar perfis e capacidades" }, 403);
    const userId = String(corpo.userId ?? "");
    const perfilBaseCodigo = String(corpo.perfilBaseCodigo ?? "");
    const capacidades = Array.isArray(corpo.capacidades) ? [...new Set(corpo.capacidades.map(String))] : [];
    const { data: base } = await admin.from("perfis_base_a52").select("role_legado").eq("codigo", perfilBaseCodigo).eq("ativo", true).single();
    const { data: permitidas } = await admin.from("catalogo_capacidades_a53").select("codigo").eq("ativa", true).in("codigo", capacidades);
    if (!userId || !base || (permitidas ?? []).length !== capacidades.length)
      return resposta(req, { error: "Perfil ou capacidades inválidos" }, 400);
    const { data: alvo } = await admin.from("perfis").select("super_admin").eq("id", userId).single();
    if (!alvo) return resposta(req, { error: "Utilizador não encontrado" }, 404);
    if (alvo.super_admin && perfilBaseCodigo !== "super_admin")
      return resposta(req, { error: "O perfil-base do Super Admin não pode ser removido" }, 409);
    const { error: erroAtualizar } = await admin.from("perfis").update({
      perfil_base_codigo: perfilBaseCodigo,
      role: base.role_legado,
    }).eq("id", userId);
    if (erroAtualizar) return resposta(req, { error: "Não foi possível atualizar o perfil" }, 400);
    const { error: erroLimpar } = await admin.from("capacidades_perfil_r32").delete().eq("perfil_id", userId);
    if (erroLimpar) return resposta(req, { error: "Não foi possível atualizar as capacidades" }, 400);
    if (capacidades.length) {
      const { error } = await admin.from("capacidades_perfil_r32").insert(capacidades.map((capacidade) => ({ perfil_id: userId, capacidade })));
      if (error) return resposta(req, { error: "Perfil atualizado; capacidades exigem revisão" }, 409);
    }
    await evento("UTILIZADOR_PERMISSOES_ATUALIZADAS", user.id, userId, { perfilBaseCodigo, capacidades });
    return resposta(req, { ok: true });
  }

  if (acao === "alterar_estado_utilizador") {
    if (!perfil.super_admin) return resposta(req, { error: "Só o super admin pode alterar o estado de utilizadores" }, 403);
    const userId = String(corpo.userId ?? "");
    const estado = String(corpo.estado ?? "");
    if (!userId || !["ativo", "bloqueado", "desativado"].includes(estado))
      return resposta(req, { error: "Estado inválido" }, 400);
    if (userId === user.id && estado !== "ativo") return resposta(req, { error: "Não podes bloquear ou desativar a tua própria conta" }, 409);
    const { data: alvo } = await admin.from("perfis").select("super_admin").eq("id", userId).single();
    if (!alvo) return resposta(req, { error: "Utilizador não encontrado" }, 404);
    if (alvo.super_admin && estado !== "ativo") return resposta(req, { error: "A conta Super Admin não pode ser bloqueada por esta operação" }, 409);
    const { error: erroAuth } = await admin.auth.admin.updateUserById(userId, { ban_duration: estado === "ativo" ? "none" : "876000h" });
    if (erroAuth) return resposta(req, { error: "Não foi possível alterar o acesso de autenticação" }, 400);
    const { error } = await admin.from("perfis").update({ estado_utilizador_a53: estado }).eq("id", userId);
    if (error) return resposta(req, { error: "Autenticação alterada; estado do perfil exige revisão" }, 409);
    await evento("UTILIZADOR_ESTADO_ALTERADO", user.id, userId, { estado });
    return resposta(req, { ok: true });
  }

  if (acao === "repor_acesso_operacional") {
    const userId = String(corpo.userId ?? "");
    if (!userId) return resposta(req, { error: "Utilizador inválido" }, 400);
    const { error } = await admin.from("credenciais_operacionais_a52").update({
      tentativas_pin: 0, exige_password: true, tentativas_password: 0,
      bloqueado_ate_reset: false, atualizado_em: new Date().toISOString(),
    }).eq("perfil_id", userId);
    if (error) return resposta(req, { error: "Não foi possível repor o acesso operacional" }, 400);
    await evento("ACESSO_OPERACIONAL_REPOSTO", user.id, userId);
    return resposta(req, { ok: true });
  }

  if (acao === "repor_password") {
    const userId = String(corpo.userId ?? "");
    const { data: alvo, error: erroAlvo } = await admin.from("perfis").select("super_admin").eq("id", userId).single();
    if (!userId || erroAlvo || !alvo) return resposta(req, { error: "Utilizador não encontrado" }, 404);
    if ((alvo.super_admin || userId === user.id) && !perfil.super_admin)
      return resposta(req, { error: "Só o super admin pode repor este acesso" }, 403);
    const desde = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await admin.from("eventos_seguranca_r322").select("id", { count: "exact", head: true })
      .eq("tipo", "PASSWORD_REPOSTA").eq("perfil_id", user.id).gte("criado_em", desde);
    if ((count ?? 0) >= 5) return resposta(req, { error: "Aguarde 15 minutos antes de fazer novas reposições" }, 429);
    const password = passwordTemporaria();
    const { error: erroAuth } = await admin.auth.admin.updateUserById(userId, {
      password, user_metadata: { deve_alterar_password: true },
    });
    if (erroAuth) return resposta(req, { error: "Não foi possível repor a palavra-passe" }, 400);
    const { error } = await admin.from("perfis").update({ deve_alterar_password: true }).eq("id", userId);
    if (error) return resposta(req, { error: "Password reposta; falta sincronizar o primeiro acesso" }, 409);
    await evento("PASSWORD_REPOSTA", user.id, userId);
    return resposta(req, { ok: true, password });
  }
  return resposta(req, { error: "Ação desconhecida" }, 400);
});
