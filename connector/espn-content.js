(() => {
  "use strict";

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("espn-page-bridge.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (
      !message ||
      message.type !== "SLATE_FANTASY_CAPTURE" ||
      message.source !== "espn" ||
      !message.snapshot
    ) return;

    chrome.runtime.sendMessage({
      type: "SLATE_CAPTURE",
      platform: "espn",
      capturedAt: message.capturedAt,
      snapshots: [message.snapshot],
    });
  });
})();
