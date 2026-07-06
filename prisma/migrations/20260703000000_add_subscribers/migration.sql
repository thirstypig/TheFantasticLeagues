-- CreateTable: marketing email list for the public site (double opt-in).
-- Only email is stored — no names, no phone.
CREATE TABLE "Subscriber" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'The Fantastic Leagues',
    "confirmationToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "lastConfirmationSentAt" TIMESTAMP(3),
    "unsubscribeToken" TEXT,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_confirmationToken_key" ON "Subscriber"("confirmationToken");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_unsubscribeToken_key" ON "Subscriber"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "Subscriber_status_idx" ON "Subscriber"("status");

-- Lock this table from the public/anon Supabase API (defense in depth).
-- The app writes via Prisma over the direct Postgres connection (table owner),
-- which bypasses RLS. With RLS enabled and NO policies granted, the Supabase
-- `anon` and `authenticated` roles (the public/browser keys) can neither read
-- nor insert. Every write goes through the server, never the browser.
ALTER TABLE "Subscriber" ENABLE ROW LEVEL SECURITY;
