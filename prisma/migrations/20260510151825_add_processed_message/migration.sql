-- CreateTable
CREATE TABLE "ProcessedMessage" (
    "id" TEXT NOT NULL,
    "messageSid" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "replyText" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedMessage_messageSid_key" ON "ProcessedMessage"("messageSid");

-- CreateIndex
CREATE INDEX "ProcessedMessage_processedAt_idx" ON "ProcessedMessage"("processedAt");
