export interface Proposal {
    module: string;
    confidence: number;  // 0.0–1.0
    priority: number;    // 0-10 (urgency/relevance)
    payload: any;
    reasoning: string;
}