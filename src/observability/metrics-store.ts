/**
 * In-Memory Time-Series Metrics Store
 *
 * Stores metrics in memory with automatic aggregation and cleanup.
 * Simple, zero-dependency solution for observability.
 */

export interface MetricPoint {
  timestamp: number;
  agentType: 'human' | 'openai' | 'anthropic' | 'custom';
  agentId?: string;
  method: string;
  path: string;
  statusCode: number;
  responseTimeMs: number;
  isRateLimited: boolean;
}

export interface AggregatedMetrics {
  timeSeries: {
    timestamp: number;
    humanRequests: number;
    agentRequests: number;
    totalRequests: number;
    errorRate: number;
    avgResponseTime: number;
  }[];

  summary: {
    totalRequests: number;
    humanRequests: number;
    agentRequests: number;
    errorRate: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };

  byAgentType: {
    [key: string]: {
      requests: number;
      errors: number;
      avgResponseTime: number;
    };
  };

  byEndpoint: {
    path: string;
    requests: number;
    errors: number;
    avgResponseTime: number;
  }[];

  topAgents: {
    agentId: string;
    agentType: string;
    requests: number;
    errors: number;
  }[];

  rateLimitViolations: number;
}

class MetricsStore {
  private points: MetricPoint[] = [];
  private readonly maxPoints = 10000; // Keep last 10k requests
  private readonly maxAgeMs = 60 * 60 * 1000; // 1 hour

  /**
   * Record a metric point
   */
  record(point: MetricPoint): void {
    this.points.push(point);

    // Cleanup old data
    if (this.points.length > this.maxPoints) {
      this.points = this.points.slice(-this.maxPoints);
    }

    this.cleanup();
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(windowMinutes: number = 60): AggregatedMetrics {
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const recentPoints = this.points.filter(p => p.timestamp > now - windowMs);

    return {
      timeSeries: this.aggregateTimeSeries(recentPoints, windowMinutes),
      summary: this.calculateSummary(recentPoints),
      byAgentType: this.aggregateByAgentType(recentPoints),
      byEndpoint: this.aggregateByEndpoint(recentPoints),
      topAgents: this.getTopAgents(recentPoints),
      rateLimitViolations: recentPoints.filter(p => p.isRateLimited).length,
    };
  }

  /**
   * Aggregate into time buckets (1-minute intervals)
   */
  private aggregateTimeSeries(
    points: MetricPoint[],
    windowMinutes: number
  ): AggregatedMetrics['timeSeries'] {
    const now = Date.now();
    const bucketSizeMs = 60 * 1000; // 1 minute
    const buckets = new Map<number, MetricPoint[]>();

    // Create buckets for the time window
    for (let i = 0; i < windowMinutes; i++) {
      const bucketTime = now - (i * bucketSizeMs);
      const bucketKey = Math.floor(bucketTime / bucketSizeMs) * bucketSizeMs;
      buckets.set(bucketKey, []);
    }

    // Fill buckets with points
    for (const point of points) {
      const bucketKey = Math.floor(point.timestamp / bucketSizeMs) * bucketSizeMs;
      const bucket = buckets.get(bucketKey);
      if (bucket) {
        bucket.push(point);
      }
    }

    // Aggregate each bucket
    const series: AggregatedMetrics['timeSeries'] = [];
    for (const [timestamp, bucketPoints] of buckets.entries()) {
      const humanReqs = bucketPoints.filter(p => p.agentType === 'human').length;
      const agentReqs = bucketPoints.filter(p => p.agentType !== 'human').length;
      const errors = bucketPoints.filter(p => p.statusCode >= 400).length;
      const avgResponseTime = bucketPoints.length > 0
        ? bucketPoints.reduce((sum, p) => sum + p.responseTimeMs, 0) / bucketPoints.length
        : 0;

      series.push({
        timestamp,
        humanRequests: humanReqs,
        agentRequests: agentReqs,
        totalRequests: bucketPoints.length,
        errorRate: bucketPoints.length > 0 ? errors / bucketPoints.length : 0,
        avgResponseTime,
      });
    }

    return series.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(points: MetricPoint[]): AggregatedMetrics['summary'] {
    const humanReqs = points.filter(p => p.agentType === 'human').length;
    const agentReqs = points.filter(p => p.agentType !== 'human').length;
    const errors = points.filter(p => p.statusCode >= 400).length;

    // Calculate percentiles
    const sortedResponseTimes = points
      .map(p => p.responseTimeMs)
      .sort((a, b) => a - b);

    const p50 = this.percentile(sortedResponseTimes, 50);
    const p95 = this.percentile(sortedResponseTimes, 95);
    const p99 = this.percentile(sortedResponseTimes, 99);

    return {
      totalRequests: points.length,
      humanRequests: humanReqs,
      agentRequests: agentReqs,
      errorRate: points.length > 0 ? errors / points.length : 0,
      p50ResponseTime: p50,
      p95ResponseTime: p95,
      p99ResponseTime: p99,
    };
  }

  /**
   * Aggregate by agent type
   */
  private aggregateByAgentType(
    points: MetricPoint[]
  ): AggregatedMetrics['byAgentType'] {
    const byType: AggregatedMetrics['byAgentType'] = {};

    for (const point of points) {
      if (!byType[point.agentType]) {
        byType[point.agentType] = {
          requests: 0,
          errors: 0,
          avgResponseTime: 0,
        };
      }

      byType[point.agentType].requests++;
      if (point.statusCode >= 400) {
        byType[point.agentType].errors++;
      }
    }

    // Calculate average response times
    for (const type of Object.keys(byType)) {
      const typePoints = points.filter(p => p.agentType === type);
      const totalTime = typePoints.reduce((sum, p) => sum + p.responseTimeMs, 0);
      byType[type].avgResponseTime = totalTime / typePoints.length;
    }

    return byType;
  }

  /**
   * Aggregate by endpoint
   */
  private aggregateByEndpoint(points: MetricPoint[]): AggregatedMetrics['byEndpoint'] {
    const byPath = new Map<string, { requests: number; errors: number; totalTime: number }>();

    for (const point of points) {
      const existing = byPath.get(point.path) || { requests: 0, errors: 0, totalTime: 0 };
      existing.requests++;
      if (point.statusCode >= 400) existing.errors++;
      existing.totalTime += point.responseTimeMs;
      byPath.set(point.path, existing);
    }

    return Array.from(byPath.entries())
      .map(([path, data]) => ({
        path,
        requests: data.requests,
        errors: data.errors,
        avgResponseTime: data.totalTime / data.requests,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10); // Top 10 endpoints
  }

  /**
   * Get top agents by request count
   */
  private getTopAgents(points: MetricPoint[]): AggregatedMetrics['topAgents'] {
    const agentMap = new Map<string, { type: string; requests: number; errors: number }>();

    for (const point of points) {
      if (!point.agentId) continue;

      const existing = agentMap.get(point.agentId) || {
        type: point.agentType,
        requests: 0,
        errors: 0,
      };
      existing.requests++;
      if (point.statusCode >= 400) existing.errors++;
      agentMap.set(point.agentId, existing);
    }

    return Array.from(agentMap.entries())
      .map(([agentId, data]) => ({
        agentId,
        agentType: data.type,
        requests: data.requests,
        errors: data.errors,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10); // Top 10 agents
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((sorted.length * p) / 100) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Cleanup old data
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.maxAgeMs;
    this.points = this.points.filter(p => p.timestamp > cutoff);
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.points = [];
  }

  /**
   * Get current point count (for debugging)
   */
  getPointCount(): number {
    return this.points.length;
  }
}

// Singleton instance
export const metricsStore = new MetricsStore();
