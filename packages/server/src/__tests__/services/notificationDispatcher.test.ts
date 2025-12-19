/**
 * NotificationDispatcher Integration Tests
 *
 * Tests for notification delivery including:
 * - Provider routing
 * - Event filtering
 * - Media type filtering
 * - User-specific notifications
 * - Error handling and logging
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { MediaType, NotificationProvider } from "@prisma/client";
import type {
  NotificationPayload,
  NotificationResult,
} from "../../services/notifications/types.js";
import { createMockPrisma } from "../setup.js";

// Mock the db/client module
const mockPrisma = createMockPrisma();
mock.module("../../db/client.js", () => ({
  prisma: mockPrisma,
}));

// Import services AFTER mocking
import {
  type BaseNotificationProvider,
  NotificationDispatcher,
} from "../../services/notifications/NotificationDispatcher.js";

// Mock notification provider
class MockProvider implements BaseNotificationProvider {
  static calls: Array<{ payload: NotificationPayload; config: Record<string, unknown> }> = [];
  static shouldFail = false;
  static resetCalls() {
    MockProvider.calls = [];
    MockProvider.shouldFail = false;
  }

  async send(
    payload: NotificationPayload,
    config: Record<string, unknown>
  ): Promise<NotificationResult> {
    MockProvider.calls.push({ payload, config });

    if (MockProvider.shouldFail) {
      return {
        success: false,
        provider: NotificationProvider.WEBHOOK,
        configId: "test",
        error: "Mock provider failure",
      };
    }

    return {
      success: true,
      provider: NotificationProvider.WEBHOOK,
      configId: "test",
      deliveryId: `mock-${Date.now()}`,
    };
  }
}

describe("NotificationDispatcher - Integration Tests", () => {
  let dispatcher: NotificationDispatcher;
  let mockRequestId: string;
  let _userId: string;

  beforeEach(async () => {
    // Create dispatcher with mock provider
    dispatcher = new NotificationDispatcher();
    // Replace provider with mock
    (dispatcher as any).providers.set(NotificationProvider.WEBHOOK, new MockProvider());
    (dispatcher as any).providers.set(NotificationProvider.DISCORD, new MockProvider());
    (dispatcher as any).providers.set(NotificationProvider.EMAIL, new MockProvider());

    MockProvider.resetCalls();

    // Clear mock data
    mockPrisma._clear();

    // Create test request
    const request = await mockPrisma.mediaRequest.create({
      data: {
        type: "MOVIE",
        tmdbId: 12345,
        title: "Test Movie",
        year: 2024,
        status: "PENDING",
        targets: [],
      },
    });
    mockRequestId = request.id;
    _userId = "test-user-123";
  });

  afterEach(() => {
    // Clear mock data
    mockPrisma._clear();
  });

  describe("Provider Routing", () => {
    it("dispatches to matching notification config", async () => {
      await mockPrisma.notificationConfig.create({
        data: {
          name: "Test Webhook",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          config: { url: "https://example.com/webhook" },
        },
      });

      const results = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: { title: "Test Movie" },
      });

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(MockProvider.calls.length).toBe(1);
      expect(MockProvider.calls[0].payload.event).toBe("request.completed");
    });

    it("dispatches to multiple matching configs", async () => {
      await mockPrisma.notificationConfig.create({
        data: {
          name: "Webhook 1",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          config: { url: "https://example.com/webhook1" },
        },
      });

      await mockPrisma.notificationConfig.create({
        data: {
          name: "Discord",
          provider: NotificationProvider.DISCORD,
          enabled: true,
          events: ["request.completed"],
          config: { webhookUrl: "https://discord.com/webhook" },
        },
      });

      const results = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: { title: "Test Movie" },
      });

      expect(results.length).toBe(2);
      expect(MockProvider.calls.length).toBe(2);
    });

    it("does not dispatch to disabled configs", async () => {
      await mockPrisma.notificationConfig.create({
        data: {
          name: "Disabled Config",
          provider: NotificationProvider.WEBHOOK,
          enabled: false,
          events: ["request.completed"],
          config: { url: "https://example.com/webhook" },
        },
      });

      const results = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: { title: "Test Movie" },
      });

      expect(results.length).toBe(0);
      expect(MockProvider.calls.length).toBe(0);
    });
  });

  describe("Event Filtering", () => {
    beforeEach(async () => {
      await mockPrisma.notificationConfig.create({
        data: {
          name: "Completed Events",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed", "request.failed"],
          config: { url: "https://example.com/webhook" },
        },
      });
    });

    it("dispatches when event matches", async () => {
      const results = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
      });

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
    });

    it("does not dispatch when event does not match", async () => {
      const results = await dispatcher.dispatch({
        event: "request.searching",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
      });

      expect(results.length).toBe(0);
    });

    it("dispatches to multiple events", async () => {
      const results1 = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
      });

      const results2 = await dispatcher.dispatch({
        event: "request.failed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
      });

      expect(results1.length).toBe(1);
      expect(results2.length).toBe(1);
    });
  });

  describe("Media Type Filtering", () => {
    it("dispatches to config with no media type filter", async () => {
      await mockPrisma.notificationConfig.create({
        data: {
          name: "All Media",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          mediaType: null,
          config: { url: "https://example.com/webhook" },
        },
      });

      const movieResults = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
      });

      const tvResults = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.TV,
        data: {},
      });

      expect(movieResults.length).toBe(1);
      expect(tvResults.length).toBe(1);
    });

    it("dispatches to config with matching media type", async () => {
      await mockPrisma.notificationConfig.create({
        data: {
          name: "Movies Only",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          mediaType: MediaType.MOVIE,
          config: { url: "https://example.com/webhook" },
        },
      });

      const movieResults = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
      });

      const tvResults = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.TV,
        data: {},
      });

      expect(movieResults.length).toBe(1);
      expect(tvResults.length).toBe(0);
    });

    it("dispatches to both filtered and unfiltered configs", async () => {
      await mockPrisma.notificationConfig.create({
        data: {
          name: "All Media",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          mediaType: null,
          config: { url: "https://example.com/webhook1" },
        },
      });

      await mockPrisma.notificationConfig.create({
        data: {
          name: "Movies Only",
          provider: NotificationProvider.DISCORD,
          enabled: true,
          events: ["request.completed"],
          mediaType: MediaType.MOVIE,
          config: { webhookUrl: "https://discord.com/webhook" },
        },
      });

      const results = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
      });

      expect(results.length).toBe(2);
    });
  });

  describe("User-Specific Notifications", () => {
    it("dispatches to global config when no userId filter", async () => {
      await mockPrisma.notificationConfig.create({
        data: {
          name: "Global Notifications",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          userId: null, // No user filter
          config: { url: "https://example.com/webhook" },
        },
      });

      const results = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
      });

      expect(results.length).toBe(1);
    });

    it("does not dispatch to global config when userId is specified", async () => {
      // Global config (userId: null)
      await mockPrisma.notificationConfig.create({
        data: {
          name: "Global Notifications",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          userId: null, // No user filter
          config: { url: "https://example.com/webhook" },
        },
      });

      // When userId is provided in dispatch, it only matches configs with that userId
      const results = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
        userId: "some-user", // This filters to only configs with userId="some-user"
      });

      expect(results.length).toBe(0); // Global config (null userId) doesn't match
    });
  });

  describe("Error Handling", () => {
    it("handles provider failure gracefully", async () => {
      await mockPrisma.notificationConfig.create({
        data: {
          name: "Failing Config",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          config: { url: "https://example.com/webhook" },
        },
      });

      MockProvider.shouldFail = true;

      const results = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
      });

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBeDefined();
    });

    it("logs activity when notification fails", async () => {
      await mockPrisma.notificationConfig.create({
        data: {
          name: "Failing Config",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          config: { url: "https://example.com/webhook" },
        },
      });

      MockProvider.shouldFail = true;

      await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
      });

      const activities = await mockPrisma.activityLog.findMany({
        where: { requestId: mockRequestId },
      });

      expect(activities.length).toBeGreaterThan(0);
      expect(activities[0].message).toContain("Notification failed");
    });

    it("continues dispatching after one provider fails", async () => {
      await mockPrisma.notificationConfig.create({
        data: {
          name: "Failing Config",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          config: { url: "https://example.com/webhook" },
        },
      });

      await mockPrisma.notificationConfig.create({
        data: {
          name: "Success Config",
          provider: NotificationProvider.DISCORD,
          enabled: true,
          events: ["request.completed"],
          config: { webhookUrl: "https://discord.com/webhook" },
        },
      });

      // First call will fail, second will succeed
      let callCount = 0;
      const originalSend = MockProvider.prototype.send;
      MockProvider.prototype.send = async function (
        payload: NotificationPayload,
        config: Record<string, unknown>
      ) {
        callCount++;
        if (callCount === 1) {
          return {
            success: false,
            provider: NotificationProvider.WEBHOOK,
            configId: "test",
            error: "First provider failed",
          };
        }
        return originalSend.call(this, payload, config);
      };

      const results = await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
      });

      expect(results.length).toBe(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);

      // Restore original method
      MockProvider.prototype.send = originalSend;
    });
  });

  describe("Test Notification", () => {
    it("sends test notification successfully", async () => {
      const config = await mockPrisma.notificationConfig.create({
        data: {
          name: "Test Config",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          config: { url: "https://example.com/webhook" },
        },
      });

      const result = await dispatcher.testNotification(config.id);

      expect(result.success).toBe(true);
      expect(result.configId).toBe(config.id);
      expect(MockProvider.calls.length).toBe(1);
      expect(MockProvider.calls[0].payload.event).toBe("test");
      expect(MockProvider.calls[0].payload.data.title).toBe("Test Movie");
    });

    it("returns error when config not found", async () => {
      const result = await dispatcher.testNotification("non-existent-id");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Config not found");
    });

    it("returns error when provider not registered", async () => {
      // Create a config with EMAIL provider but remove it from the dispatcher
      const config = await mockPrisma.notificationConfig.create({
        data: {
          name: "Unregistered Provider",
          provider: NotificationProvider.EMAIL,
          enabled: true,
          events: ["request.completed"],
          config: {},
        },
      });

      // Remove EMAIL provider from dispatcher
      (dispatcher as any).providers.delete(NotificationProvider.EMAIL);

      const result = await dispatcher.testNotification(config.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Provider");

      // Restore provider for other tests
      (dispatcher as any).providers.set(NotificationProvider.EMAIL, new MockProvider());
    });
  });

  describe("Payload Construction", () => {
    it("includes all required payload fields", async () => {
      await mockPrisma.notificationConfig.create({
        data: {
          name: "Test Config",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          config: { url: "https://example.com/webhook" },
        },
      });

      const testData = {
        title: "Test Movie",
        year: 2024,
        quality: "1080p",
      };

      await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: testData,
      });

      const call = MockProvider.calls[0];
      expect(call.payload.event).toBe("request.completed");
      expect(call.payload.requestId).toBe(mockRequestId);
      expect(call.payload.mediaType).toBe(MediaType.MOVIE);
      expect(call.payload.data).toEqual(testData);
      expect(call.payload.timestamp).toBeDefined();
    });

    it("passes provider-specific config to send method", async () => {
      const webhookConfig = {
        url: "https://example.com/webhook",
        headers: { Authorization: "Bearer token" },
      };

      await mockPrisma.notificationConfig.create({
        data: {
          name: "Test Config",
          provider: NotificationProvider.WEBHOOK,
          enabled: true,
          events: ["request.completed"],
          config: webhookConfig,
        },
      });

      await dispatcher.dispatch({
        event: "request.completed",
        requestId: mockRequestId,
        mediaType: MediaType.MOVIE,
        data: {},
      });

      const call = MockProvider.calls[0];
      expect(call.config).toEqual(webhookConfig);
    });
  });
});
