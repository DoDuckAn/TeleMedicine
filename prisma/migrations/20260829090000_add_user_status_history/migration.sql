CREATE TABLE "UserStatusHistory" (
    "id" TEXT NOT NULL,
    "userID" TEXT NOT NULL,
    "changedByID" TEXT NOT NULL,
    "fromStatus" "UserStatus" NOT NULL,
    "toStatus" "UserStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserStatusHistory_userID_createdAt_idx"
ON "UserStatusHistory"("userID", "createdAt");

CREATE INDEX "UserStatusHistory_changedByID_createdAt_idx"
ON "UserStatusHistory"("changedByID", "createdAt");

ALTER TABLE "UserStatusHistory"
ADD CONSTRAINT "UserStatusHistory_userID_fkey"
FOREIGN KEY ("userID") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserStatusHistory"
ADD CONSTRAINT "UserStatusHistory_changedByID_fkey"
FOREIGN KEY ("changedByID") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
