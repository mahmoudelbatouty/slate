"use strict";

const dashboardInput = document.querySelector("#dashboardUrl");
const tokenInput = document.querySelector("#connectorToken");
const status = document.querySelector("#status");

function normalizedOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Dashboard must use http or https");
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
  ]);
  dashboardInput.value = stored.dashboardUrl || "http://localhost:3000";
  tokenInput.value = stored.connectorToken || "";
  if (stored.lastError) status.textContent = stored.lastError;
  else if (stored.lastCaptureAt) {
    status.textContent = `Last synced ${new Date(stored.lastCaptureAt).toLocaleString()} · ${stored.lastUpdated || 0} matchups updated`;
  } else if (stored.connectorToken) status.textContent = "Paired. Open or refresh a Sleeper matchup.";
  else status.textContent = "Not paired.";
}

document.querySelector("#save").addEventListener("click", async () => {
  try {
    const dashboardUrl = normalizedOrigin(dashboardInput.value.trim());
    const connectorToken = tokenInput.value.trim();
    if (!connectorToken.startsWith("slate_")) throw new Error("Invalid connector token");

    const granted = await chrome.permissions.request({ origins: [`${dashboardUrl}/*`] });
    if (!granted) throw new Error("Dashboard access was not granted");

    await chrome.storage.local.set({ dashboardUrl, connectorToken, lastError: null });
    status.textContent = "Paired. Open or refresh a Sleeper matchup.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Could not save connection";
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
