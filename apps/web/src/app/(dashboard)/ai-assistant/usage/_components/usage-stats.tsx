"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  DollarSign,
  Zap,
  Clock,
} from "lucide-react";

type AnalyticsData = {
  summary: {
    totalRequests: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: string;
    avgTokensPerRequest: number;
    avgCostPerRequest: string;
  };
  dailyStats: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  modelStats: Array<{ model: string; requests: number; tokens: number; cost: number }>;
  userStats: Array<{ userId: string; userName: string; requests: number; tokens: number; cost: number }>;
  finishReasons: Record<string, number>;
  recentRequests: Array<{
    id: string;
    model: string;
    endpoint: string;
    tokens: number;
    cost: string;
    finishReason: string | null;
    createdAt: string;
  }>;
};

export function UsageStats() {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "all">("week");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      setIsPending(true);
      try {
        const response = await fetch(`/api/ai-usage/analytics?period=${period}`);
        if (response.ok) {
          const result = (await response.json()) as AnalyticsData;
          setData(result);
        }
      } catch (error) {
        console.error("Failed to load analytics:", error);
      } finally {
        setIsPending(false);
      }
    }

    fetchAnalytics();
  }, [period]);

  if (isPending && !data) {
    return (
      <div className="container mx-auto max-w-7xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="container mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Usage Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Track your AI assistant usage, costs, and performance
          </p>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <TabsList>
            <TabsTrigger value="day">Today</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="all">All Time</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.totalRequests}</div>
            <p className="text-xs text-muted-foreground">
              {data.summary.avgTokensPerRequest} tokens/request avg
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.summary.totalTokens.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.summary.totalInputTokens.toLocaleString()} in /{" "}
              {data.summary.totalOutputTokens.toLocaleString()} out
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${data.summary.totalCost}</div>
            <p className="text-xs text-muted-foreground">
              ${data.summary.avgCostPerRequest}/request avg
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Latest Activity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.recentRequests.length > 0 ? (
                <>
                  {new Date(data.recentRequests[0].createdAt).toLocaleTimeString()}
                </>
              ) : (
                "N/A"
              )}
            </div>
            <p className="text-xs text-muted-foreground">Most recent request</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Stats Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Usage Trends</CardTitle>
          <CardDescription>Requests and token usage over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.dailyStats.length > 0 ? (
              <div className="space-y-2">
                {data.dailyStats.map((day) => (
                  <div key={day.date} className="flex items-center gap-4">
                    <div className="w-24 text-sm text-muted-foreground">
                      {new Date(day.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-6 bg-primary/20 rounded"
                          style={{
                            width: `${Math.max((day.requests / Math.max(...data.dailyStats.map(d => d.requests))) * 100, 5)}%`,
                          }}
                        />
                        <span className="text-sm">{day.requests} requests</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {day.tokens.toLocaleString()} tokens • ${day.cost.toFixed(4)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No usage data for this period
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Model Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Usage by Model</CardTitle>
            <CardDescription>Breakdown by AI model</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.modelStats.map((model) => (
                <div key={model.model} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{model.model}</span>
                    <span className="text-muted-foreground">
                      {model.requests} requests
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{model.tokens.toLocaleString()} tokens</span>
                    <span>${model.cost.toFixed(4)}</span>
                  </div>
                  <div
                    className="h-2 bg-primary/20 rounded-full overflow-hidden"
                  >
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${Math.max((model.cost / Math.max(...data.modelStats.map(m => m.cost))) * 100, 5)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage by User</CardTitle>
            <CardDescription>Requests by team members</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.userStats.map((user) => (
                <div key={user.userId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{user.userName}</span>
                    <span className="text-muted-foreground">
                      {user.requests} requests
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{user.tokens.toLocaleString()} tokens</span>
                    <span>${user.cost.toFixed(4)}</span>
                  </div>
                  <div
                    className="h-2 bg-primary/20 rounded-full overflow-hidden"
                  >
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${Math.max((user.cost / Math.max(...data.userStats.map(u => u.cost))) * 100, 5)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Finish Reasons */}
      <Card>
        <CardHeader>
          <CardTitle>Finish Reasons</CardTitle>
          <CardDescription>How requests completed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(data.finishReasons).map(([reason, count]) => (
              <div key={reason} className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">
                  {reason.replace(/_/g, " ")}
                </span>
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-24 bg-muted rounded-full overflow-hidden"
                  >
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${(count / data.summary.totalRequests) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-12 text-right">
                    {count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Requests</CardTitle>
          <CardDescription>Last 20 AI requests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Time</th>
                  <th className="text-left py-2 px-4">Model</th>
                  <th className="text-left py-2 px-4">Endpoint</th>
                  <th className="text-right py-2 px-4">Tokens</th>
                  <th className="text-right py-2 px-4">Cost</th>
                  <th className="text-left py-2 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRequests.map((req) => (
                  <tr key={req.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-4 text-muted-foreground">
                      {new Date(req.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2 px-4 font-mono text-xs">{req.model}</td>
                    <td className="py-2 px-4 font-mono text-xs">{req.endpoint}</td>
                    <td className="py-2 px-4 text-right">
                      {req.tokens.toLocaleString()}
                    </td>
                    <td className="py-2 px-4 text-right">${req.cost}</td>
                    <td className="py-2 px-4">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          req.finishReason === "stop"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : req.finishReason === "length"
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
                        }`}
                      >
                        {req.finishReason || "unknown"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
