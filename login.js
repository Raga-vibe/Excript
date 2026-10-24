const form = document.querySelector("#auth-form");
const emailInput = document.querySelector("#auth-email");
const passwordInput = document.querySelector("#auth-password");
const passwordField = document.querySelector("#password-field");
const passwordLabel = document.querySelector("#password-label");
const authTitle = document.querySelector("#auth-title");
const authSubtitle = document.querySelector("#auth-subtitle");
const authSubmit = document.querySelector("#auth-submit");
const authMessage = document.querySelector("#auth-message");
const authSwitch = document.querySelector("#auth-switch");
const modeToggle = document.querySelector("#mode-toggle");
const forgotPassword = document.querySelector("#forgot-password");
const configNote = document.querySelector("#auth-config-note");

let authClient = null;
let authMode = new URLSearchParams(location.search).get("mode") === "signup" ? "signup" : "signin";
form.querySelectorAll("input, button").forEach((element) => { element.disabled = true; });

function showMessage(message, kind = "") {
  authMessage.textContent = message;
  authMessage.dataset.kind = kind;
}

function setMode(mode) {
  authMode = mode;
  const recovery = mode === "recovery";
  const updatePassword = mode === "update";
  const signingUp = mode === "signup";
  passwordField.hidden = recovery;
  forgotPassword.hidden = recovery || updatePassword || signingUp;
  authSwitch.hidden = recovery || updatePassword;
  passwordInput.required = !recovery;
  passwordInput.autocomplete = updatePassword ? "new-password" : "current-password";

  if (mode === "signup") {
    authTitle.textContent = "Create your library";
    authSubtitle.textContent = "One account keeps your collection in sync.";
    passwordLabel.textContent = "Password";
    authSubmit.innerHTML = "Create account <span aria-hidden=\"true\">→</span>";
    authSwitch.innerHTML = "Already have an account? <button id=\"mode-toggle\" type=\"button\">Sign in</button>";
  } else if (mode === "recovery") {
    authTitle.textContent = "Reset your password";
    authSubtitle.textContent = "We’ll email you a secure reset link.";
    authSubmit.innerHTML = "Send reset link <span aria-hidden=\"true\">→</span>";
  } else if (mode === "update") {
    authTitle.textContent = "Choose a new password";
    authSubtitle.textContent = "Use at least 8 characters for your new password.";
    passwordLabel.textContent = "New password";
    authSubmit.innerHTML = "Update password <span aria-hidden=\"true\">→</span>";
  } else {
    authTitle.textContent = "Welcome back";
    authSubtitle.textContent = "Sign in to continue to your library.";
    passwordLabel.textContent = "Password";
    authSubmit.innerHTML = "Sign in <span aria-hidden=\"true\">→</span>";
    authSwitch.innerHTML = "New to Excript? <button id=\"mode-toggle\" type=\"button\">Create an account</button>";
  }
  authSwitch.querySelector("button")?.addEventListener("click", () => setMode(authMode === "signup" ? "signin" : "signup"));
  showMessage("");
}

modeToggle.addEventListener("click", () => setMode("signup"));
forgotPassword.addEventListener("click", () => setMode("recovery"));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  authSubmit.disabled = true;
  showMessage("Working…");

  try {
    let result;
    if (authMode === "signup") {
      result = await authClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/app.html` },
      });
      if (!result.error && !result.data.session) {
        showMessage("Check your email to confirm your account. Then sign in here.");
        return;
      }
    } else if (authMode === "recovery") {
      result = await authClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/login.html?mode=recovery`,
      });
      if (!result.error) {
        showMessage("If that email has an Excript account, a password reset link is on its way.");
        return;
      }
    } else if (authMode === "update") {
      result = await authClient.auth.updateUser({ password });
      if (!result.error) {
        showMessage("Password updated. Opening your library…");
        location.replace("/app.html");
        return;
      }
    } else {
      result = await authClient.auth.signInWithPassword({ email, password });
      if (!result.error) {
        location.replace("/app.html");
        return;
      }
    }

    if (result?.error) showMessage(result.error.message, "error");
  } catch {
    showMessage("Could not complete that request. Please try again.", "error");
  } finally {
    authSubmit.disabled = false;
  }
});

void (async () => {
  const auth = await window.excriptAuthReady;
  authClient = auth.client;
  if (!authClient) {
    configNote.hidden = false;
    showMessage(auth.error || "Sign-in is not configured yet.", "error");
    form.querySelectorAll("input, button").forEach((element) => { element.disabled = true; });
    return;
  }

  form.querySelectorAll("input, button").forEach((element) => { element.disabled = false; });

  if (auth.session && new URLSearchParams(location.search).get("mode") !== "recovery") {
    location.replace("/app.html");
    return;
  }
  if (new URLSearchParams(location.search).get("mode") === "recovery") setMode("update");
  else setMode(authMode);
})();
