-- CreateEnum
CREATE TYPE "CreditPurchaseStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "CreditPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "priceAr" INTEGER NOT NULL,
    "paymentMethod" "EventPaymentMethod" NOT NULL,
    "status" "CreditPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditPurchase_status_idx" ON "CreditPurchase"("status");

-- AddForeignKey
ALTER TABLE "CreditPurchase" ADD CONSTRAINT "CreditPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

