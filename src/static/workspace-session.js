(() => {
  const originalFetch = window.fetch.bind(window);
  let leaving = false;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = new URL(typeof args[0] === "string" ? args[0] : args[0].url, location.href);
    if (response.status === 401 && url.origin === location.origin && !url.pathname.startsWith("/api/auth/") && !leaving) {
      leaving = true;
      window.dispatchEvent(new Event("workspace-session-ended"));
      location.replace("/login?next="+encodeURIComponent(location.pathname+location.search));
    }
    return response;
  };
})();
