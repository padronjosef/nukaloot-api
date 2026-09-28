# nukaloot-api

## Testing

Cover the failure paths, not only the happy path. For every behaviour, also write
the case that must be **rejected**: invalid input, missing permission, a limit
exceeded, an expired or forged token, an ambiguous value.

A suite that only proves the good case gives false confidence — the bugs that
cost somebody money live at the edges. When reviewing, ask what *should* be
refused and check that it actually is, rather than assuming.

## The browser console

Shipping the frontend with anything in the browser console — an error, a
warning, a React key complaint, a failed request — is not allowed. Not "known",
not "pre-existing", not "only in dev". The console is where the next real bug
will show up, and it is useless the moment it has noise in it to scroll past.

Before saying a change is done, open it and read the console. Verifying is the
job; assuming is not.

**"It comes from an extension" is not a pass.** It is an explanation, not a fix.
The person looking at that console is the one we are building for, and they have
the extension. Handle it — `suppressHydrationWarning` on the elements an
extension edits, a guard around the API it breaks — or, if it genuinely cannot
be handled, write down in the code why, so the next person does not spend an
afternoon on it.

`npm run test:console` is the guard: a real browser against the running app,
failing on any console error, warning, uncaught exception or dead request. It
includes a browser extension editing the DOM before React hydrates, which is
what caused the error it was written for. Run it before saying a frontend
change is done.

One thing genuinely cannot be fixed from here: an extension that rewrites
elements *inside* the app — Dark Reader's dynamic mode does — makes React
report a hydration mismatch. `suppressHydrationWarning` covers one element and
its own attributes, and switching it on everywhere would hide the mismatches
that *are* ours. Measured: a production build says nothing, so nobody using the
site sees it; only a dev build reports it. The guard asserts that this is the
only thing such an extension is allowed to produce.

## The database schema

`synchronize` is off. It rewrote the schema to match the entities on every
boot, which in production is a deploy able to drop a column — and the data in
it — because somebody renamed a field. Migrations are the record of what
changed and the only way back.

- `npm run migration:generate src/migrations/WhatChanged` after changing an
  entity, then read what it produced before committing it.
- `npm run migration:run` applies them; the app also runs them on boot.
- `DB_SYNCHRONIZE=true` brings the old behaviour back for a throwaway local
  database, and turns the boot-time migration off with it.

A database that already has the schema — one built by `synchronize` before
this existed — has to be told the initial migration is already applied, or the
first boot tries to create tables that are there and fails:

```sql
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY, timestamp bigint NOT NULL, name character varying NOT NULL
);
INSERT INTO migrations(timestamp, name)
SELECT 1790128255470, 'InitialSchema1790128255470'
WHERE NOT EXISTS (SELECT 1 FROM migrations WHERE name = 'InitialSchema1790128255470');
```
