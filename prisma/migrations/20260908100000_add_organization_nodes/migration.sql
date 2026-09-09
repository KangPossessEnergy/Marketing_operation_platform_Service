-- CreateEnum
CREATE TYPE "OrganizationNodeType" AS ENUM ('ROOT', 'REGION', 'AGENT', 'STORE');

-- CreateTable
CREATE TABLE "organization_nodes" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "type" "OrganizationNodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contact_name" TEXT,
    "address" TEXT,
    "contact_phone" TEXT,
    "region" TEXT,
    "province" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_nodes_code_key" ON "organization_nodes"("code");

-- CreateIndex
CREATE INDEX "organization_nodes_parent_id_sort_order_name_idx" ON "organization_nodes"("parent_id", "sort_order", "name");

-- CreateIndex
CREATE INDEX "organization_nodes_type_idx" ON "organization_nodes"("type");

-- AddForeignKey
ALTER TABLE "organization_nodes" ADD CONSTRAINT "organization_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organization_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
