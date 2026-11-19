-- Todo #333: drop the tables of the retired chat feature (code deleted in #525).
-- Both had 0 rows in prod on 2026-11-18, and no other table references them.
--
-- IF EXISTS keeps this idempotent: a database that never had them (or a partial
-- apply) cannot fail here and freeze deploys with P3009. Dropping ChatMessage also
-- drops its own foreign keys to League and User and its index.
DROP TABLE IF EXISTS "ChatReadCursor";
DROP TABLE IF EXISTS "ChatMessage";
