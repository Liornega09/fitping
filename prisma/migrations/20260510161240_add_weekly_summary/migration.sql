-- CreateTable
CREATE TABLE "WeeklySummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklySummary_sentAt_idx" ON "WeeklySummary"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySummary_userId_weekStart_key" ON "WeeklySummary"("userId", "weekStart");
