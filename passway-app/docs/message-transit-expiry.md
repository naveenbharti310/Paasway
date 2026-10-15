# Conservative expiry across response delivery

A reproduced regression showed that setting the server-clock anchor at response receipt extends message visibility by response transit time. A message with 500ms remaining at servedAt still appeared after a simulated 1000ms response delay.

Anchor monotonic elapsed time before the request, not after receipt. Server processing and transit now consume the visibility budget rather than extending it. This may hide a near-expiry message early by up to the request duration, intentionally preferring privacy to extra availability. Device wall time is not trusted.

Two regressions cover an expired-in-transit response and a safely fresh delayed response. Existing route/account isolation, queued-response suppression, expiry, foreground and failure tests remain mandatory.

No server/rules migration or deployment is included; this is a client-only candidate stacked on fix/release-boundaries. Existing unpatched dependency advisories remain blocking. Native evidence from an older application tree is not proof of this candidate.
