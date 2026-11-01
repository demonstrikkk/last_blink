# Production setup

Private credentials belong only in the backend process or hosting secret store.
The browser build must not receive `DATABASE_URL`, `DATABASE_SSL_CA`,
`MEKO_API_KEY`, `GROQ_API_KEY` or `GEMINI_API_KEY`.

## Required containment action

Credentials previously committed in the prototype cloud service files must be
revoked and rotated in YugabyteDB and Meko before deployment. The repository no
longer contains usable default credentials. A missing credential intentionally
selects the deterministic offline fallback.

## Configuration

Copy `.env.example` into the server environment and populate secrets there.
Use a CA certificate for YugabyteDB when the provider supplies one. TLS
certificate verification is mandatory; do not set `rejectUnauthorized` false.

After network access to the cluster is confirmed, run `npm run db:migrate` from
the project root. The migration runner uses one transaction, records its
version, and refuses to run without `DATABASE_URL`.

Meko is optional for local gameplay. Keep private, branch-specific NPC memory
in the canonical game database. Use Meko only for approved shared knowledge
until a separate datapack isolation design has been verified.

Groq and Gemini are not called from React or Phaser. They must be accessed by a
server-side model gateway that validates typed proposals before GameSession can
accept them.
