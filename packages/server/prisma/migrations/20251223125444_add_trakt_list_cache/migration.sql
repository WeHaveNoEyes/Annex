-- CreateTable
CREATE TABLE "TraktListCache" (
    "id" TEXT NOT NULL,
    "listType" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "period" TEXT,
    "filterHash" TEXT,
    "results" JSONB NOT NULL,
    "totalPages" INTEGER NOT NULL,
    "totalResults" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TraktListCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TraktListCache_expiresAt_idx" ON "TraktListCache"("expiresAt");

-- CreateIndex
CREATE INDEX "TraktListCache_listType_mediaType_page_idx" ON "TraktListCache"("listType", "mediaType", "page");

-- CreateIndex
CREATE UNIQUE INDEX "TraktListCache_listType_mediaType_page_period_filterHash_key" ON "TraktListCache"("listType", "mediaType", "page", "period", "filterHash");
