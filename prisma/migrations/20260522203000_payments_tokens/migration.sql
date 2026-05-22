CREATE TABLE "TokenPackage" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tokenAmount" INTEGER NOT NULL,
    "priceIdr" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenPackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'midtrans',
    "providerOrderId" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "providerPaymentType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amountIdr" INTEGER NOT NULL,
    "tokenAmount" INTEGER NOT NULL,
    "snapToken" TEXT,
    "snapRedirectUrl" TEXT,
    "failureReason" TEXT,
    "needsManualReview" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "tokenCreditedAt" TIMESTAMP(3),
    "tokenRevokedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentOrderId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'midtrans',
    "providerEventId" TEXT NOT NULL,
    "orderId" TEXT,
    "transactionId" TEXT,
    "transactionStatus" TEXT,
    "fraudStatus" TEXT,
    "statusCode" TEXT,
    "grossAmount" TEXT,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TokenLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentOrderId" TEXT,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TokenPackage_code_key" ON "TokenPackage"("code");
CREATE INDEX "TokenPackage_isActive_sortOrder_idx" ON "TokenPackage"("isActive", "sortOrder");
CREATE UNIQUE INDEX "PaymentOrder_providerOrderId_key" ON "PaymentOrder"("providerOrderId");
CREATE INDEX "PaymentOrder_userId_createdAt_idx" ON "PaymentOrder"("userId", "createdAt");
CREATE INDEX "PaymentOrder_status_idx" ON "PaymentOrder"("status");
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");
CREATE INDEX "PaymentEvent_paymentOrderId_createdAt_idx" ON "PaymentEvent"("paymentOrderId", "createdAt");
CREATE INDEX "PaymentEvent_orderId_idx" ON "PaymentEvent"("orderId");
CREATE UNIQUE INDEX "TokenLedgerEntry_idempotencyKey_key" ON "TokenLedgerEntry"("idempotencyKey");
CREATE INDEX "TokenLedgerEntry_userId_createdAt_idx" ON "TokenLedgerEntry"("userId", "createdAt");
CREATE INDEX "TokenLedgerEntry_paymentOrderId_idx" ON "TokenLedgerEntry"("paymentOrderId");

ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TokenPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TokenLedgerEntry" ADD CONSTRAINT "TokenLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TokenLedgerEntry" ADD CONSTRAINT "TokenLedgerEntry_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
