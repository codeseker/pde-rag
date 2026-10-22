CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TYPE "public"."document_source_type" AS ENUM('pdf', 'text');
--> statement-breakpoint
CREATE TABLE "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "source_type" "document_source_type" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1024) NOT NULL,
  "content_hash" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "embedding_model" text NOT NULL,
  CONSTRAINT "chunks_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
ALTER TABLE "chunks"
  ADD CONSTRAINT "chunks_document_id_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "chunks_embedding_hnsw" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX "chunks_document_id_idx" ON "chunks" USING btree ("document_id");
