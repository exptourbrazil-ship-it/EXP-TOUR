// Constantes de sessao sem dependencia de APIs Node (ex.: crypto), para poderem
// ser importadas com seguranca pelo Edge Runtime (proxy/middleware) sem arrastar
// o modulo "crypto" para o bundle da borda. A logica de assinatura HMAC continua
// em admin-session.ts / session.ts, que rodam apenas no runtime Node.

export const ADMIN_SESSION_COOKIE = "exp_tour_admin";
