(() => {
  "use strict";

  if (window.__slateDashboardBridgeInstalled) return;
  window.__slateDashboardBridgeInstalled = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (
      !message ||
      message.type !== "SLATE_PAIR_REQUEST" ||
      typeof message.requestId !== "string" ||
      typeof message.challengeId !== "string" ||
      typeof message.claimSecret !== "string" ||
      message.platform !== "sleeper" ||
      message.dashboardOrigin !== window.location.origin
    ) {
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "SLATE_PAIR_CLAIM",
        requestId: message.requestId,
        challengeId: message.challengeId,
        claimSecret: message.claimSecret,
        platform: message.platform,
        dashboardOrigin: message.dashboardOrigin,
      },
      (result) => {
        const runtimeError = chrome.runtime.lastError;
        window.postMessage(
          {
            type: "SLATE_PAIR_RESULT",
            requestId: message.requestId,
            ok: Boolean(result?.ok) && !runtimeError,
            error: runtimeError?.message || result?.error,
          },
          window.location.origin
        );
      }
    );
  });
})();
