// Applies the saved or system theme before the first paint, so dark mode never flashes white.
// A plain file instead of an inline script, so a strict Content-Security-Policy can allow it.
// The saved choice is localStorage "theme": "light", "dark" or "system" (the default).
(() => {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const apply = () => {
    let choice = "system";
    try {
      choice = window.localStorage.getItem("theme") ?? "system";
    } catch {
      // Storage can be blocked (strict privacy settings): follow the system then.
    }
    const dark = choice === "dark" || (choice !== "light" && media.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };

  apply();
  // Keep following the system while the page is open, unless the user picked light or dark.
  media.addEventListener("change", apply);
})();
