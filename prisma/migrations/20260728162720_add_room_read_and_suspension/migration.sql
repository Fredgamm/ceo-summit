-- CreateTable
CREATE TABLE "RoomRead" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomSuspension" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "suspendedUntil" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomSuspension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomRead_roomId_userId_key" ON "RoomRead"("roomId", "userId");

-- CreateIndex
CREATE INDEX "RoomSuspension_roomId_userId_idx" ON "RoomSuspension"("roomId", "userId");

-- AddForeignKey
ALTER TABLE "RoomRead" ADD CONSTRAINT "RoomRead_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSuspension" ADD CONSTRAINT "RoomSuspension_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
