export class ApiService {
  constructor(private readonly apiUrl: string) {}

  private base() {
    return this.apiUrl.replace(/\/$/, "");
  }

  async createThread(
    agent: string,
    parameters?: Record<string, unknown>,
    ragEnabled?: boolean | null,
  ): Promise<string> {
    const res = await fetch(`${this.base()}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent,
        parameters: parameters || undefined,
        ragEnabled: typeof ragEnabled === "boolean" ? ragEnabled : undefined,
      }),
    });
    const data = await res.json();
    return data.threadId || data.id || data._id;
  }

  async sendMessage(
    threadId: string,
    message: string,
  ): Promise<{ content?: string }> {
    const res = await fetch(`${this.base()}/threads/${threadId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    return res.json();
  }
}
