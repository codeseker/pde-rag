import { Injectable } from '@nestjs/common';
import { AskGraph, type AskResult } from './ask.graph';

@Injectable()
export class AskService {
  constructor(private readonly graph: AskGraph) {}

  ask(question: string): Promise<AskResult> {
    return this.graph.run(question);
  }
}
