export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const hasAuthConfig = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(supabaseUrl && publishableKey);
};

export const getLoginUrl = () => {
  return null;
};
