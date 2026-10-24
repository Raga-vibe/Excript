(() => {
  async function initializeAuth() {
    try {
      const response = await fetch("/api/config", { cache: "no-store" });
      const config = await response.json();
      if (!response.ok || !config.url || !config.publishableKey) {
        return { client: null, session: null, error: config.error || "Supabase is not configured yet." };
      }
      if (!window.supabase?.createClient) {
        return { client: null, session: null, error: "The sign-in library could not be loaded. Check your connection and retry." };
      }

      const client = window.supabase.createClient(config.url, config.publishableKey);
      const { data, error } = await client.auth.getSession();
      if (error) return { client, session: null, error: error.message };
      return { client, session: data.session, error: null };
    } catch {
      return { client: null, session: null, error: "Could not connect to Excript sign-in. Try again when you are online." };
    }
  }

  window.excriptAuthReady = initializeAuth();
})();
