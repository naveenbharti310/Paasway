# Account scoped safety disclosure candidate

The Settings guidance previously promised that a reported person could not connect again. The implementation blocks account UIDs in both directions, ends the reported connection, and preserves a review hold rather than banning every account that may belong to that person. Account deletion and recreation can change a UID. No permanent person or phone level ban is implemented by reporting.

NVIDIA Super, requested through `nvidia/nemotron-3.5-super-vl-120b-a12b` and returned as `private/nvidia/nemotron-3.5-super-120b-a12b`, supplied the replacement sentence:

> End the chat and report it if something feels wrong. Reporting closes the chat and blocks that account from reconnecting with you.

The engineering coordinator checked that wording against the actual report and block handlers, then added a rendered Settings regression. That case failed before the wording update and passed after. The full mobile suite passes 232 tests and mobile type checking passes. This corrects a misleading disclosure, not a new universal banning mechanism or evidence that account recreation can bypass consent.

The next unpublished candidate is 0.3.7 / Android code 13, so already published internal code 12 is not reused. New source CI, native and signing acceptance are required for this candidate. The running source 78db0cbaaa35b4be27db354947073a43f2434445 native gates cannot be relabeled as code 13 evidence. Production SMS, genuine Play installed positive attestation and physical device acceptance remain separate requirements. No public rollout or new paid service is authorized by this document.
