import { prisma } from "../../db/client";
import type { IDownloadClient } from "./IDownloadClient";

export type ReleaseType = "torrent" | "nzb";

export interface ClientSelection {
  clientId: string;
  client: IDownloadClient;
}

export class DownloadClientManager {
  private clients: Map<string, IDownloadClient> = new Map();
  private clientPriorities: Map<string, number> = new Map();
  private clientHealth: Map<string, boolean> = new Map();

  async initialize(): Promise<void> {
    console.log("[DownloadClientManager] Initializing download clients");
    await this.loadClients();
  }

  async refresh(): Promise<void> {
    console.log("[DownloadClientManager] Refreshing download clients");
    this.clients.clear();
    this.clientPriorities.clear();
    this.clientHealth.clear();
    await this.loadClients();
  }

  private async loadClients(): Promise<void> {
    const dbClients = await prisma.downloadClient.findMany({
      where: { enabled: true },
      orderBy: { priority: "desc" },
    });

    for (const dbClient of dbClients) {
      this.clientPriorities.set(dbClient.id, dbClient.priority);
      this.clientHealth.set(dbClient.id, dbClient.isHealthy);
    }

    console.log(`[DownloadClientManager] Loaded ${dbClients.length} download clients`);
  }

  registerClient(clientId: string, client: IDownloadClient): void {
    this.clients.set(clientId, client);
    console.log(`[DownloadClientManager] Registered client: ${client.name} (${client.type})`);
  }

  getClient(clientId: string): IDownloadClient | null {
    return this.clients.get(clientId) || null;
  }

  selectClientForRelease(release: {
    magnetUri?: string | null;
    downloadUrl?: string | null;
    indexerType?: string;
  }): ClientSelection | null {
    const releaseType = this.detectReleaseType(release);
    console.log(`[DownloadClientManager] Detected release type: ${releaseType}`);

    const compatibleClients = Array.from(this.clients.entries())
      .filter(([clientId]) => this.clientHealth.get(clientId) !== false)
      .filter(([_, client]) => client.supportsType(releaseType))
      .sort((a, b) => {
        const priorityA = this.clientPriorities.get(a[0]) || 0;
        const priorityB = this.clientPriorities.get(b[0]) || 0;
        return priorityB - priorityA;
      });

    if (compatibleClients.length === 0) {
      console.warn(`[DownloadClientManager] No compatible clients for ${releaseType}`);
      return null;
    }

    const [clientId, client] = compatibleClients[0];
    console.log(
      `[DownloadClientManager] Selected client: ${client.name} (priority: ${this.clientPriorities.get(clientId)})`
    );

    return { clientId, client };
  }

  getDefaultClient(type: ReleaseType): ClientSelection | null {
    const compatibleClients = Array.from(this.clients.entries())
      .filter(([clientId]) => this.clientHealth.get(clientId) !== false)
      .filter(([_, client]) => client.supportsType(type))
      .sort((a, b) => {
        const priorityA = this.clientPriorities.get(a[0]) || 0;
        const priorityB = this.clientPriorities.get(b[0]) || 0;
        return priorityB - priorityA;
      });

    if (compatibleClients.length === 0) {
      return null;
    }

    const [clientId, client] = compatibleClients[0];
    return { clientId, client };
  }

  private detectReleaseType(release: {
    magnetUri?: string | null;
    downloadUrl?: string | null;
    indexerType?: string;
  }): ReleaseType {
    if (release.magnetUri) {
      return "torrent";
    }

    if (release.downloadUrl) {
      const url = release.downloadUrl.toLowerCase();
      if (url.includes(".nzb") || url.includes("/nzb/") || url.includes("getnzb")) {
        return "nzb";
      }
    }

    if (release.indexerType?.toUpperCase() === "NEWZNAB") {
      return "nzb";
    }

    return "torrent";
  }
}

let clientManagerInstance: DownloadClientManager | null = null;

export function getDownloadClientManager(): DownloadClientManager {
  if (!clientManagerInstance) {
    clientManagerInstance = new DownloadClientManager();
  }
  return clientManagerInstance;
}
