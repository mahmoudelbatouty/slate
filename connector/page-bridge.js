(() => {
  "use strict";

  if (window.__slateFantasyBridgeInstalled) return;
  window.__slateFantasyBridgeInstalled = true;

  const GRAPHQL_URL = "https://sleeper.com/graphql";
  const MESSAGE_TYPE = "SLATE_FANTASY_CAPTURE";
  const IDENTITY_MESSAGE_TYPE = "SLATE_SLEEPER_IDENTITY";
  let lastPublishedUserId = null;

  function publishIdentity() {
    let value = null;
    try {
      // This is Sleeper's non-secret numeric account ID. Do not read any
      // token, email, password field, cookie, or other storage key.
      value = window.localStorage.getItem("user_id");
    } catch {
      return;
    }
    const userId = typeof value === "string" ? value.replace(/^"|"$/g, "") : "";
    if (!/^\d+$/.test(userId) || userId === lastPublishedUserId) return;
    lastPublishedUserId = userId;
    window.postMessage({
      type: IDENTITY_MESSAGE_TYPE,
      source: "sleeper",
      capturedAt: new Date().toISOString(),
      userId,
    }, window.location.origin);
  }

  publishIdentity();
  window.addEventListener("focus", publishIdentity);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") publishIdentity();
  });
  const identityPoll = window.setInterval(publishIdentity, 1_000);
  window.setTimeout(() => window.clearInterval(identityPoll), 120_000);

  function isApprovedRequest(url, method, body) {
    if (url !== GRAPHQL_URL || method.toUpperCase() !== "POST") return false;
    if (typeof body !== "string") return false;
    try {
      const request = JSON.parse(body);
      return (
        typeof request.query === "string" &&
        /\bmatchup_legs(?:_related_to_roster)?\b/.test(request.query)
      );
    } catch {
      return false;
    }
  }

  function publish(json) {
    if (!json || typeof json !== "object" || !json.data) return;
    const matchups = Object.entries(json.data).flatMap(([key, value]) =>
      key.startsWith("matchup_legs") && Array.isArray(value) ? value : []
    );
    if (matchups.length === 0) return;

    window.postMessage(
      {
        type: MESSAGE_TYPE,
        source: "sleeper",
        capturedAt: new Date().toISOString(),
        matchups,
      },
      window.location.origin
    );
  }

  const originalFetch = window.fetch;
  window.fetch = async function slateFetch(input, init) {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const requestClone = input instanceof Request ? input.clone() : null;
    const bodyPromise = typeof init?.body === "string"
      ? Promise.resolve(init.body)
      : requestClone
        ? requestClone.text().catch(() => "")
        : Promise.resolve("");

    const response = await originalFetch.apply(this, arguments);
    void Promise.all([bodyPromise, response.clone().json()])
      .then(([body, json]) => {
        if (isApprovedRequest(url, method, body)) publish(json);
      })
      .catch(() => undefined);
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function slateOpen(method, url) {
    this.__slateMethod = method;
    this.__slateUrl = new URL(String(url), window.location.href).href;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function slateSend(body) {
    const requestBody = typeof body === "string" ? body : "";
    this.addEventListener("load", () => {
      if (!isApprovedRequest(this.__slateUrl ?? "", this.__slateMethod ?? "GET", requestBody)) {
        return;
      }
      try {
        publish(JSON.parse(this.responseText));
      } catch {
        // A malformed or non-JSON response is simply not connector data.
      }
    });
    return originalSend.apply(this, arguments);
  };
})();
