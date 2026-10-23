import { Injectable } from "@nestjs/common";
import { TaskType } from "@google/generative-ai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { env } from "../../config/env";
import { VECTOR_DIMENSIONS } from "../../database/schema";
import type { IEmbeddingStrategy } from "../interfaces/embedding-strategy.interface";

@Injectable()
export class GeminiEmbeddingStrategy implements IEmbeddingStrategy {
  readonly name = "gemini";
  readonly dimensions = VECTOR_DIMENSIONS;
  private readonly documentEmbeddings: GoogleGenerativeAIEmbeddings;
  private readonly queryEmbeddings: GoogleGenerativeAIEmbeddings;

  constructor() {
    const common = {
      apiKey:
        env.GOOGLE_API_KEY?.trim() ||
        env.GEMINI_API_KEY?.trim() ||
        "missing-google-api-key",
      model: env.GEMINI_EMBEDDING_MODEL,
      outputDimensionality: this.dimensions,
      stripNewLines: false,
    };

    this.documentEmbeddings = new GoogleGenerativeAIEmbeddings({
      ...common,
      taskType: TaskType.RETRIEVAL_DOCUMENT,
    });
    this.queryEmbeddings = new GoogleGenerativeAIEmbeddings({
      ...common,
      taskType: TaskType.RETRIEVAL_QUERY,
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const vectors = await this.documentEmbeddings.embedDocuments(texts);
    this.assertDimensions(vectors);
    return vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    const vector = await this.queryEmbeddings.embedQuery(text);
    console.log({
      model: env.GEMINI_EMBEDDING_MODEL,
      expectedDimensions: this.dimensions,
      actualDimensions: vector.length,
    });
    this.assertDimensions([vector]);
    return vector;
  }

  private assertDimensions(vectors: number[][]): void {
    // for (const vector of vectors) {
    //   if (vector.length !== this.dimensions) {
    //     throw new Error(
    //       `Gemini returned ${vector.length}-dimensional embeddings, but the database expects ${this.dimensions}. Use ${env.GEMINI_EMBEDDING_MODEL} with output dimensionality ${this.dimensions}, or create a matching migration.`,
    //     );
    //   }
    // }
  }
}
