-- CreateEnum
CREATE TYPE "DownloadClientType" AS ENUM ('QBITTORRENT', 'SABNZBD', 'NZBGET');

-- AlterTable
ALTER TABLE "Download" ADD COLUMN     "client_hash" TEXT,
ADD COLUMN     "download_client_id" TEXT;

-- CreateTable
CREATE TABLE "download_clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DownloadClientType" NOT NULL,
    "url" TEXT NOT NULL,
    "username" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "supportedTypes" TEXT[],
    "base_dir" TEXT,
    "is_healthy" BOOLEAN NOT NULL DEFAULT true,
    "last_health_check" TIMESTAMP(3),
    "last_error" TEXT,
    "total_downloads" INTEGER NOT NULL DEFAULT 0,
    "active_downloads" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "download_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "download_clients_name_key" ON "download_clients"("name");

-- CreateIndex
CREATE INDEX "download_clients_enabled_priority_idx" ON "download_clients"("enabled", "priority");

-- CreateIndex
CREATE INDEX "download_clients_type_enabled_idx" ON "download_clients"("type", "enabled");

-- CreateIndex
CREATE INDEX "Download_download_client_id_idx" ON "Download"("download_client_id");

-- AddForeignKey
ALTER TABLE "Download" ADD CONSTRAINT "Download_download_client_id_fkey" FOREIGN KEY ("download_client_id") REFERENCES "download_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
