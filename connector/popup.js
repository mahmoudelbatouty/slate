"use strict";

const dashboardInput = document.querySelector("#dashboardUrl");
const status = document.querySelector("#status");

function normalizedOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Dashboard must use HTTP or HTTPS");
  }
  return url.origin;
}

async function renderStatus() {
  const stored = await chrome.storage.local.get([
    "dashboardUrl",
    "connectorToken",
    "lastCaptureAt",
    "lastUpdated",
    "lastError",
    "connections",
  ]);
  dashboardInput.value = stored.dashboardUrl || "http://localhost:3000";
  if (stored.lastError) status.textContent = stored.lastError;
  else if (stored.lastCaptureAt) {
    status.textContent = `Last synced ${new Date(stored.lastCaptureAt).toLocaleString()} · ${stored.lastUpdated || 0} matchups updated`;
  } else if (stored.connections?.sleeper || stored.connectorToken) status.textContent = "Sleeper connected. Open or refresh a Sleeper matchup.";
  else if (stored.connections?.espn) status.textContent = "ESPN paired. Return to Slate after signing in on ESPN.";
  else status.textContent = "Dashboard approved. Choose a platform in Slate.";
}

document.querySelector("#save").addEventListener("click", async () => {
  try {
    const dashboardUrl = normalizedOrigin(dashboardInput.value.trim());
    const granted = await chrome.permissions.request({ origins: [`${dashboardUrl}/*`] });
    if (!granted) throw new Error("Dashboard access was not granted");

    const registered = await chrome.runtime.sendMessage({
      type: "SLATE_REGISTER_DASHBOARD",
      dashboardUrl,
    });
    if (!registered?.ok) throw new Error(registered?.error || "Could not approve dashboard");

    await chrome.storage.local.set({ dashboardUrl, lastError: null });
    status.textContent = "Dashboard approved. Choose a platform in Slate.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Could not approve dashboard";
  }
});

document.querySelector("#sync").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://sleeper.com/leagues/")) {
    status.textContent = "Make a Sleeper league the active tab first.";
    return;
  }
  await chrome.tabs.reload(tab.id);
  status.textContent = "Refreshing Sleeper. The capture will arrive after the matchup loads.";
});

void renderStatus();
