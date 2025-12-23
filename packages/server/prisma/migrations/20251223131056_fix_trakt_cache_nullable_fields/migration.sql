/*
  Warnings:

  - Made the column `period` on table `TraktListCache` required. This step will fail if there are existing NULL values in that column.
  - Made the column `filterHash` on table `TraktListCache` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "TraktListCache" ALTER COLUMN "period" SET NOT NULL,
ALTER COLUMN "period" SET DEFAULT '',
ALTER COLUMN "filterHash" SET NOT NULL,
ALTER COLUMN "filterHash" SET DEFAULT '';
