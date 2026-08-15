-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'USER');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "display_name" VARCHAR(100) NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refresh_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" VARCHAR(255) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurants" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "menu_items" (
  "id" UUID NOT NULL,
  "restaurant_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "restaurant_id" UUID NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "total_amount" DECIMAL(12,2) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_items" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "menu_item_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "provider_ref" VARCHAR(160),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "actor_id" UUID,
  "action" VARCHAR(100) NOT NULL,
  "aggregate_type" VARCHAR(80) NOT NULL,
  "aggregate_id" VARCHAR(100) NOT NULL,
  "metadata" JSONB,
  "correlation_id" VARCHAR(100),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "aggregate_type" VARCHAR(80) NOT NULL,
  "aggregate_id" VARCHAR(100) NOT NULL,
  "payload" JSONB NOT NULL,
  "correlation_id" VARCHAR(100),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMPTZ(3),
  "locked_by" VARCHAR(100),
  "published_at" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processed_messages" (
  "id" UUID NOT NULL,
  "consumer" VARCHAR(100) NOT NULL,
  "event_id" UUID NOT NULL,
  "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_deliveries" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "channel" VARCHAR(30) NOT NULL DEFAULT 'IN_APP',
  "template" VARCHAR(100) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- Indexes are query-shaped: identity lookups, role filtering, order timelines,
-- outbox leasing, and consumer idempotency. Rationale is expanded in docs/architecture.md.
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_role_active_idx" ON "users"("role", "active");
CREATE INDEX "refresh_tokens_user_expiry_idx" ON "refresh_tokens"("user_id", "expires_at");
CREATE INDEX "restaurants_active_name_idx" ON "restaurants"("active", "name");
CREATE INDEX "menu_items_restaurant_available_idx" ON "menu_items"("restaurant_id", "available");
CREATE INDEX "orders_user_created_idx" ON "orders"("user_id", "created_at" DESC);
CREATE INDEX "orders_restaurant_status_created_idx" ON "orders"("restaurant_id", "status", "created_at" DESC);
CREATE INDEX "orders_status_created_idx" ON "orders"("status", "created_at" DESC);
CREATE INDEX "order_items_order_idx" ON "order_items"("order_id");
CREATE INDEX "order_items_menu_item_idx" ON "order_items"("menu_item_id");
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");
CREATE INDEX "payments_order_status_idx" ON "payments"("order_id", "status");
CREATE INDEX "audit_aggregate_created_idx" ON "audit_logs"("aggregate_type", "aggregate_id", "created_at" DESC);
CREATE INDEX "audit_actor_created_idx" ON "audit_logs"("actor_id", "created_at" DESC);
CREATE INDEX "outbox_pending_idx" ON "outbox_events"("published_at", "next_attempt_at", "created_at");
CREATE INDEX "outbox_lock_idx" ON "outbox_events"("locked_at");
CREATE INDEX "processed_messages_processed_idx" ON "processed_messages"("processed_at");
CREATE UNIQUE INDEX "processed_messages_consumer_event_key" ON "processed_messages"("consumer", "event_id");
CREATE INDEX "notification_status_created_idx" ON "notification_deliveries"("status", "created_at");
CREATE UNIQUE INDEX "notification_event_channel_key" ON "notification_deliveries"("event_id", "channel");

-- Foreign keys keep the relational model honest while avoiding destructive cascades
-- for financial and order history.
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
