-- CreateEnum
CREATE TYPE "AppType" AS ENUM ('WORKFLOW', 'CHATBOT', 'AGENT');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'SUCCESS', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "emailVerified" TIMESTAMP(3),
    "verifyToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apps" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT '🤖',
    "type" "AppType" NOT NULL DEFAULT 'WORKFLOW',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "config" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "activePublishedId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "appId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_apps" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "appId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT,

    CONSTRAINT "published_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "inputs" JSONB,
    "outputs" JSONB,
    "error" TEXT,
    "duration" INTEGER,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "nodeTraces" JSONB,
    "appId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "appId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_executions" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "inputs" JSONB,
    "outputs" JSONB,
    "error" TEXT,
    "duration" INTEGER,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "nodeTraces" JSONB,
    "publishedAppId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "app_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_verifyToken_key" ON "users"("verifyToken");

-- CreateIndex
CREATE INDEX "apps_userId_idx" ON "apps"("userId");

-- CreateIndex
CREATE INDEX "apps_type_idx" ON "apps"("type");

-- CreateIndex
CREATE INDEX "workflows_appId_idx" ON "workflows"("appId");

-- CreateIndex
CREATE INDEX "workflows_version_idx" ON "workflows"("version");

-- CreateIndex
CREATE INDEX "published_apps_appId_idx" ON "published_apps"("appId");

-- CreateIndex
CREATE INDEX "published_apps_version_idx" ON "published_apps"("version");

-- CreateIndex
CREATE UNIQUE INDEX "published_apps_appId_version_key" ON "published_apps"("appId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_executions_executionId_key" ON "workflow_executions"("executionId");

-- CreateIndex
CREATE INDEX "workflow_executions_appId_idx" ON "workflow_executions"("appId");

-- CreateIndex
CREATE INDEX "workflow_executions_status_idx" ON "workflow_executions"("status");

-- CreateIndex
CREATE INDEX "workflow_executions_startedAt_idx" ON "workflow_executions"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_appId_idx" ON "api_keys"("appId");

-- CreateIndex
CREATE INDEX "api_keys_key_idx" ON "api_keys"("key");

-- CreateIndex
CREATE UNIQUE INDEX "app_executions_executionId_key" ON "app_executions"("executionId");

-- CreateIndex
CREATE INDEX "app_executions_publishedAppId_idx" ON "app_executions"("publishedAppId");

-- CreateIndex
CREATE INDEX "app_executions_apiKeyId_idx" ON "app_executions"("apiKeyId");

-- CreateIndex
CREATE INDEX "app_executions_status_idx" ON "app_executions"("status");

-- CreateIndex
CREATE INDEX "app_executions_startedAt_idx" ON "app_executions"("startedAt");

-- AddForeignKey
ALTER TABLE "apps" ADD CONSTRAINT "apps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apps" ADD CONSTRAINT "apps_activePublishedId_fkey" FOREIGN KEY ("activePublishedId") REFERENCES "published_apps"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_apps" ADD CONSTRAINT "published_apps_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_executions" ADD CONSTRAINT "app_executions_publishedAppId_fkey" FOREIGN KEY ("publishedAppId") REFERENCES "published_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_executions" ADD CONSTRAINT "app_executions_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
