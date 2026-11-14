const api = window.bananaforge;
const input = document.querySelector("#profileName");
const error = document.querySelector("#error");
const create = document.querySelector("#create");

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

async function createProfile() {
  if (create.disabled) return;
  const name = input.value.trim();
  if (!name) {
    showError("Enter a profile name.");
    input.focus();
    return;
  }
  create.disabled = true;
  try {
    await api.createProfile({ name, description: document.querySelector('#profileDescription').value, accent: document.querySelector('#profileAccent').value });
    await api.closeProfileDialog();
  } catch (caught) {
    showError((caught?.message || String(caught)).replace(/^Error:\s*/, ""));
    create.disabled = false;
  }
}

document.querySelector("#cancel").onclick = () => api.closeProfileDialog();
create.onclick = createProfile;
input.oninput = () => { error.hidden = true; };
input.onkeydown = (event) => {
  if (event.key === "Enter") createProfile();
  if (event.key === "Escape") api.closeProfileDialog();
};
window.addEventListener("DOMContentLoaded", () => {
  input.focus();
  input.select();
});
