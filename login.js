(() => {
  const form = document.querySelector("[data-login-form]");
  const error = document.querySelector("[data-login-error]");
  const button = form.querySelector('button[type="submit"]');
  if (new URLSearchParams(location.search).has("server")) {
    error.textContent = "The protected shop server is not running. Start it from the project folder, then sign in here.";
  }
  fetch("/api/admin/session", { cache: "no-store" }).then((response) => {
    if (response.ok) location.replace("/admin.html");
    else if (response.status !== 401) error.textContent = "The protected shop server is not running. Start it from the project folder first.";
  }).catch(() => {});

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    button.disabled = true;
    button.textContent = "Signing in…";
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.elements.password.value }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The protected shop server is not running. Start it from the project folder first.");
      location.replace("/admin.html");
    } catch (err) {
      error.textContent = err.message.includes("Failed to fetch")
        ? "The shop server is not running. Start it from the project folder, then try again."
        : err.message;
    } finally {
      button.disabled = false;
      button.textContent = "Sign in to inventory";
      form.elements.password.value = "";
    }
  });
})();
