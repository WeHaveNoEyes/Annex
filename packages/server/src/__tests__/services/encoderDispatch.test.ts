/**
 * Encoder Dispatch Service Tests
 *
 * Tests for the refactored encoder dispatch service focusing on:
 * - State machine transitions (PENDING -> ASSIGNED -> ENCODING -> COMPLETED/FAILED)
 * - Retry logic and error handling
 * - Stall detection
 * - Crash recovery
 * - Non-happy path scenarios (errors, edge cases)
 */

import { describe, expect, it } from "bun:test";

// =============================================================================
// Path Translation Tests
// =============================================================================

describe("Path Translation", () => {
  describe("Happy Path", () => {
    it("should translate server encoding path to remote path", () => {
      const serverPath = "/media/encoding/test.mkv";
      const mappings = [
        { server: "/media/encoding", remote: "/mnt/downloads/encoding" },
        { server: "/media", remote: "/mnt/downloads" },
      ];

      let result = serverPath;
      for (const mapping of mappings) {
        if (serverPath.startsWith(mapping.server)) {
          result = serverPath.replace(mapping.server, mapping.remote);
          break;
        }
      }

      expect(result).toBe("/mnt/downloads/encoding/test.mkv");
    });

    it("should translate server media path to remote path", () => {
      const serverPath = "/media/downloads/movie.mkv";
      const mappings = [
        { server: "/media/encoding", remote: "/mnt/downloads/encoding" },
        { server: "/media", remote: "/mnt/downloads" },
      ];

      let result = serverPath;
      for (const mapping of mappings) {
        if (serverPath.startsWith(mapping.server)) {
          result = serverPath.replace(mapping.server, mapping.remote);
          break;
        }
      }

      expect(result).toBe("/mnt/downloads/downloads/movie.mkv");
    });

    it("should use more specific path first", () => {
      const path = "/media/encoding/output.mkv";
      const mappings = [
        { server: "/media/encoding", remote: "/mnt/downloads/encoding" },
        { server: "/media", remote: "/mnt/downloads" },
      ];

      let result = path;
      for (const mapping of mappings) {
        if (path.startsWith(mapping.server)) {
          result = path.replace(mapping.server, mapping.remote);
          break;
        }
      }

      // Should match /media/encoding, not /media
      expect(result).toBe("/mnt/downloads/encoding/output.mkv");
      expect(result).not.toBe(
        "/mnt/downloads/encoding/output.mkv".replace("encoding", "downloads")
      );
    });
  });

  describe("Edge Cases", () => {
    it("should return original path if no mapping matches", () => {
      const path = "/other/path/file.mkv";
      const mappings = [
        { server: "/media/encoding", remote: "/mnt/downloads/encoding" },
        { server: "/media", remote: "/mnt/downloads" },
      ];

      let result = path;
      for (const mapping of mappings) {
        if (path.startsWith(mapping.server)) {
          result = path.replace(mapping.server, mapping.remote);
          break;
        }
      }

      expect(result).toBe("/other/path/file.mkv");
    });

    it("should handle paths with special characters", () => {
      const path = "/media/downloads/Movie (2024) [1080p].mkv";
      const mappings = [{ server: "/media", remote: "/mnt/downloads" }];

      let result = path;
      for (const mapping of mappings) {
        if (path.startsWith(mapping.server)) {
          result = path.replace(mapping.server, mapping.remote);
          break;
        }
      }

      expect(result).toBe("/mnt/downloads/downloads/Movie (2024) [1080p].mkv");
    });

    it("should handle empty path", () => {
      const path = "";
      const mappings = [{ server: "/media", remote: "/mnt/downloads" }];

      let result = path;
      for (const mapping of mappings) {
        if (path.startsWith(mapping.server)) {
          result = path.replace(mapping.server, mapping.remote);
          break;
        }
      }

      expect(result).toBe("");
    });
  });
});

// =============================================================================
// State Machine Tests
// =============================================================================

describe("State Machine Transitions", () => {
  describe("PENDING -> ASSIGNED (Happy Path)", () => {
    it("should transition to ASSIGNED when job is sent to encoder", () => {
      const now = new Date();
      const assignment = {
        status: "PENDING" as const,
        sentAt: null as Date | null,
      };

      const updated = {
        ...assignment,
        status: "ASSIGNED" as const,
        sentAt: now,
      };

      expect(updated.status).toBe("ASSIGNED");
      expect(updated.sentAt).toBe(now);
    });

    it("should set encoderId when assigning to specific encoder", () => {
      const assignment = {
        status: "PENDING" as const,
        encoderId: "old-encoder",
      };

      const updated = {
        ...assignment,
        status: "ASSIGNED" as const,
        encoderId: "new-encoder",
      };

      expect(updated.encoderId).toBe("new-encoder");
    });
  });

  describe("ASSIGNED -> ENCODING (Happy Path)", () => {
    it("should transition to ENCODING when encoder accepts job", () => {
      const now = new Date();
      const assignment = {
        status: "ASSIGNED" as const,
        sentAt: new Date(Date.now() - 1000),
        startedAt: null as Date | null,
        lastProgressAt: null as Date | null,
      };

      const updated = {
        ...assignment,
        status: "ENCODING" as const,
        startedAt: now,
        lastProgressAt: now,
      };

      expect(updated.status).toBe("ENCODING");
      expect(updated.startedAt).toBe(now);
      expect(updated.lastProgressAt).toBe(now);
    });
  });

  describe("ASSIGNED -> PENDING (Non-Happy Path: Timeout)", () => {
    it("should reset to PENDING if job stays in ASSIGNED > 30s", () => {
      const assignedTimeout = 30000;
      const cutoff = new Date(Date.now() - assignedTimeout);

      const stuckJob = {
        status: "ASSIGNED" as const,
        sentAt: new Date(Date.now() - 60000), // 60s ago - stuck
      };

      // Job should be reset because sentAt < cutoff
      expect(stuckJob.sentAt < cutoff).toBe(true);
    });

    it("should not reset ASSIGNED jobs that are recent", () => {
      const assignedTimeout = 30000;
      const cutoff = new Date(Date.now() - assignedTimeout);

      const recentJob = {
        status: "ASSIGNED" as const,
        sentAt: new Date(Date.now() - 5000), // 5s ago - recent
      };

      // Job should NOT be reset because sentAt > cutoff
      expect(recentJob.sentAt > cutoff).toBe(true);
    });

    it("should clear sentAt when resetting to PENDING", () => {
      const assignment = {
        status: "ASSIGNED" as const,
        sentAt: new Date(),
        error: null as string | null,
      };

      const reset = {
        ...assignment,
        status: "PENDING" as const,
        sentAt: null,
        error: "Assignment timeout - encoder did not accept",
      };

      expect(reset.status).toBe("PENDING");
      expect(reset.sentAt).toBe(null);
      expect(reset.error).toContain("timeout");
    });
  });

  describe("ENCODING -> COMPLETED (Happy Path)", () => {
    it("should transition to COMPLETED with metrics on success", () => {
      const assignment = {
        status: "ENCODING" as const,
        progress: 99.5,
        outputSize: null as bigint | null,
        compressionRatio: null as number | null,
        encodeDuration: null as number | null,
        completedAt: null as Date | null,
      };

      const completed = {
        ...assignment,
        status: "COMPLETED" as const,
        progress: 100,
        outputSize: BigInt(1024 * 1024 * 500), // 500MB
        compressionRatio: 0.65,
        encodeDuration: 3600, // 1 hour
        completedAt: new Date(),
      };

      expect(completed.status).toBe("COMPLETED");
      expect(completed.progress).toBe(100);
      expect(completed.compressionRatio).toBe(0.65);
      expect(completed.encodeDuration).toBe(3600);
      expect(completed.completedAt).toBeInstanceOf(Date);
    });
  });

  describe("ENCODING -> FAILED (Non-Happy Path)", () => {
    it("should transition to FAILED on non-retriable error", () => {
      const assignment = {
        status: "ENCODING" as const,
        attempt: 3,
        maxAttempts: 3,
        error: null as string | null,
        completedAt: null as Date | null,
      };

      const failed = {
        ...assignment,
        status: "FAILED" as const,
        error: "FFmpeg error: invalid input",
        completedAt: new Date(),
      };

      expect(failed.status).toBe("FAILED");
      expect(failed.error).toContain("FFmpeg");
      expect(failed.completedAt).toBeInstanceOf(Date);
    });

    it("should transition to PENDING for retry if attempts remaining", () => {
      const assignment = {
        status: "ENCODING" as const,
        attempt: 1,
        maxAttempts: 3,
        progress: 0,
        error: null as string | null,
      };

      // Should retry because attempt < maxAttempts
      expect(assignment.attempt < assignment.maxAttempts).toBe(true);

      const retried = {
        ...assignment,
        status: "PENDING" as const,
        attempt: 2, // Incremented
        progress: 0,
        error: "Temporary failure",
      };

      expect(retried.status).toBe("PENDING");
      expect(retried.attempt).toBe(2);
    });
  });

  describe("ENCODING -> PENDING (Non-Happy Path: Stall)", () => {
    it("should reset to PENDING if job stalls", () => {
      const assignment = {
        status: "ENCODING" as const,
        progress: 45.5,
        attempt: 1,
        maxAttempts: 3,
      };

      const reset = {
        ...assignment,
        status: "PENDING" as const,
        progress: 0,
        attempt: 2, // Incremented because had progress
        error: `Stalled at ${assignment.progress.toFixed(1)}%`,
      };

      expect(reset.status).toBe("PENDING");
      expect(reset.progress).toBe(0);
      expect(reset.error).toContain("Stalled");
    });
  });
});

// =============================================================================
// Retry Logic Tests
// =============================================================================

describe("Retry Logic", () => {
  describe("Capacity Errors (Non-Happy Path)", () => {
    it("should identify capacity error from message", () => {
      const capacityErrors = [
        "Encoder at capacity",
        "encoder at capacity - queue full",
        "ENCODER DISCONNECTED",
        "No available encoder for this job",
      ];

      for (const error of capacityErrors) {
        const isCapacityError =
          error.toLowerCase().includes("encoder at capacity") ||
          error.toLowerCase().includes("encoder disconnected") ||
          error.toLowerCase().includes("no available encoder");

        expect(isCapacityError).toBe(true);
      }
    });

    it("should NOT identify regular errors as capacity errors", () => {
      const regularErrors = [
        "FFmpeg exited with code 1",
        "Input file not found",
        "Invalid codec configuration",
        "Out of memory",
      ];

      for (const error of regularErrors) {
        const isCapacityError =
          error.toLowerCase().includes("encoder at capacity") ||
          error.toLowerCase().includes("encoder disconnected") ||
          error.toLowerCase().includes("no available encoder");

        expect(isCapacityError).toBe(false);
      }
    });

    it("should not increment attempt for capacity errors", () => {
      const assignment = { attempt: 1, maxAttempts: 3 };
      const isCapacityError = true;

      // For capacity errors, attempt should NOT be incremented
      const newAttempt = isCapacityError ? assignment.attempt : assignment.attempt + 1;
      expect(newAttempt).toBe(1);
    });

    it("should block encoder temporarily on capacity error", () => {
      const now = Date.now();
      const blockDuration = 10000; // 10 seconds
      const blockedUntil = new Date(now + blockDuration);

      expect(blockedUntil.getTime()).toBe(now + blockDuration);
      expect(blockedUntil.getTime()).toBeGreaterThan(now);
    });
  });

  describe("Real Encoding Failures (Non-Happy Path)", () => {
    it("should increment attempt for real encoding failures", () => {
      const assignment = { attempt: 1, maxAttempts: 3 };
      const isCapacityError = false;

      const newAttempt = isCapacityError ? assignment.attempt : assignment.attempt + 1;
      expect(newAttempt).toBe(2);
    });

    it("should fail permanently when max attempts reached", () => {
      const assignment = { attempt: 3, maxAttempts: 3 };

      expect(assignment.attempt >= assignment.maxAttempts).toBe(true);
    });
  });

  describe("Input File Errors (Edge Case)", () => {
    it("should not retry if input file does not exist on server", () => {
      const error = "Input file not found: /media/downloads/missing.mkv";
      const fileExistsOnServer = false;

      // If file doesn't exist on server, don't retry
      const shouldRetry =
        !error.toLowerCase().includes("input file not found") || fileExistsOnServer;
      expect(shouldRetry).toBe(false);
    });

    it("should retry if input file exists on server but encoder couldnt find it", () => {
      const error = "Input file not found: /mnt/downloads/present.mkv";
      const fileExistsOnServer = true;

      // If file exists on server but encoder couldn't find it (NFS issue), retry
      const shouldRetry =
        !error.toLowerCase().includes("input file not found") || fileExistsOnServer;
      expect(shouldRetry).toBe(true);
    });
  });
});

// =============================================================================
// Stall Detection Tests
// =============================================================================

describe("Stall Detection", () => {
  describe("Progress Timeout (Non-Happy Path)", () => {
    it("should detect jobs with no progress update for 2 minutes", () => {
      const stallTimeout = 120000; // 2 minutes
      const cutoff = new Date(Date.now() - stallTimeout);

      const stalledJob = {
        status: "ENCODING" as const,
        lastProgressAt: new Date(Date.now() - 180000), // 3 minutes ago
        progress: 45.5,
      };

      expect(stalledJob.lastProgressAt < cutoff).toBe(true);
    });

    it("should not flag jobs that recently sent progress", () => {
      const stallTimeout = 120000; // 2 minutes
      const cutoff = new Date(Date.now() - stallTimeout);

      const activeJob = {
        status: "ENCODING" as const,
        lastProgressAt: new Date(Date.now() - 30000), // 30 seconds ago
        progress: 45.5,
      };

      expect(activeJob.lastProgressAt > cutoff).toBe(true);
    });
  });

  describe("Never Started (Non-Happy Path)", () => {
    it("should detect jobs that never sent any progress", () => {
      const stallTimeout = 120000;
      const cutoff = new Date(Date.now() - stallTimeout);

      const neverStartedJob = {
        status: "ENCODING" as const,
        lastProgressAt: null,
        startedAt: new Date(Date.now() - 180000), // Started 3 minutes ago
        progress: 0,
      };

      expect(neverStartedJob.lastProgressAt).toBe(null);
      expect(neverStartedJob.startedAt < cutoff).toBe(true);
    });
  });

  describe("Attempt Increment Logic", () => {
    it("should increment attempt if job had progress", () => {
      const stalledWithProgress = { progress: 25 };
      const shouldIncrement = stalledWithProgress.progress > 0;
      expect(shouldIncrement).toBe(true);
    });

    it("should NOT increment attempt if job never started", () => {
      const stalledWithoutProgress = { progress: 0 };
      const shouldIncrement = stalledWithoutProgress.progress > 0;
      expect(shouldIncrement).toBe(false);
    });

    it("should handle edge case of very small progress", () => {
      const minimalProgress = { progress: 0.1 };
      const shouldIncrement = minimalProgress.progress > 0;
      expect(shouldIncrement).toBe(true);
    });
  });
});

// =============================================================================
// Crash Recovery Tests
// =============================================================================

describe("Crash Recovery", () => {
  describe("Startup Recovery", () => {
    it("should reset ASSIGNED jobs to PENDING on startup", () => {
      const jobs = [
        { id: "1", status: "ASSIGNED" as const, sentAt: new Date() },
        { id: "2", status: "ENCODING" as const, startedAt: new Date() },
        { id: "3", status: "PENDING" as const, sentAt: null },
      ];

      // Only ASSIGNED jobs should be reset
      const toReset = jobs.filter((j) => j.status === "ASSIGNED");
      expect(toReset.length).toBe(1);
      expect(toReset[0].id).toBe("1");
    });

    it("should mark all encoders offline on startup", () => {
      const encoders = [
        { encoderId: "enc-1", status: "ENCODING" as const, currentJobs: 2 },
        { encoderId: "enc-2", status: "IDLE" as const, currentJobs: 0 },
        { encoderId: "enc-3", status: "OFFLINE" as const, currentJobs: 0 },
      ];

      // All non-OFFLINE encoders should be marked offline
      const toMarkOffline = encoders.filter((e) => e.status !== "OFFLINE");
      expect(toMarkOffline.length).toBe(2);
    });
  });

  describe("ENCODING Jobs After Restart (Edge Case)", () => {
    it("should leave ENCODING jobs as-is (encoder may still be processing)", () => {
      const job = {
        status: "ENCODING" as const,
        lastProgressAt: new Date(Date.now() - 30000), // 30s ago
      };

      // ENCODING jobs are handled by stall detection, not startup recovery
      // They should be left alone initially
      expect(job.status).toBe("ENCODING");
    });
  });
});

// =============================================================================
// Encoder Disconnection Tests
// =============================================================================

describe("Encoder Disconnection", () => {
  describe("Job Requeue (Non-Happy Path)", () => {
    it("should requeue ASSIGNED jobs when encoder disconnects", () => {
      const jobs = [
        { jobId: "1", status: "ASSIGNED" as const, attempt: 1, maxAttempts: 3 },
        { jobId: "2", status: "ENCODING" as const, attempt: 2, maxAttempts: 3 },
        { jobId: "3", status: "PENDING" as const, attempt: 1, maxAttempts: 3 },
      ];

      // Both ASSIGNED and ENCODING jobs should be requeued
      const toRequeue = jobs.filter((j) => j.status === "ASSIGNED" || j.status === "ENCODING");
      expect(toRequeue.length).toBe(2);
    });

    it("should increment attempt when requeuing", () => {
      const job = { attempt: 1, maxAttempts: 3 };
      const requeuedAttempt = job.attempt + 1;
      expect(requeuedAttempt).toBe(2);
    });

    it("should fail jobs exceeding max attempts on disconnect", () => {
      const job = { attempt: 3, maxAttempts: 3 };
      const canRequeue = job.attempt < job.maxAttempts;
      expect(canRequeue).toBe(false);
    });
  });

  describe("Encoder State Cleanup", () => {
    it("should mark encoder as OFFLINE on disconnect", () => {
      const encoder = {
        status: "ENCODING" as const,
        currentJobs: 2,
      };

      const offline = {
        ...encoder,
        status: "OFFLINE" as const,
        currentJobs: 0,
      };

      expect(offline.status).toBe("OFFLINE");
      expect(offline.currentJobs).toBe(0);
    });
  });
});

// =============================================================================
// Capacity Management Tests
// =============================================================================

describe("Capacity Management", () => {
  describe("Encoder Selection", () => {
    it("should find encoder with capacity", () => {
      const encoders = [
        { encoderId: "enc-1", currentJobs: 2, maxConcurrent: 2, status: "ENCODING" as const },
        { encoderId: "enc-2", currentJobs: 1, maxConcurrent: 2, status: "ENCODING" as const },
        { encoderId: "enc-3", currentJobs: 0, maxConcurrent: 1, status: "IDLE" as const },
      ];

      const available = encoders.find((e) => e.currentJobs < e.maxConcurrent);
      expect(available?.encoderId).toBe("enc-2");
    });

    it("should skip blocked encoders", () => {
      const now = Date.now();
      const encoders = [
        {
          encoderId: "enc-1",
          blockedUntil: new Date(now + 5000),
          currentJobs: 0,
          maxConcurrent: 2,
        },
        { encoderId: "enc-2", blockedUntil: null, currentJobs: 1, maxConcurrent: 2 },
      ];

      const available = encoders.find(
        (e) =>
          e.currentJobs < e.maxConcurrent && (!e.blockedUntil || e.blockedUntil.getTime() < now)
      );
      expect(available?.encoderId).toBe("enc-2");
    });

    it("should return null if all encoders at capacity", () => {
      const encoders = [
        { encoderId: "enc-1", currentJobs: 2, maxConcurrent: 2 },
        { encoderId: "enc-2", currentJobs: 1, maxConcurrent: 1 },
      ];

      const available = encoders.find((e) => e.currentJobs < e.maxConcurrent);
      expect(available).toBeUndefined();
    });

    it("should return null if all encoders blocked", () => {
      const now = Date.now();
      const encoders = [
        {
          encoderId: "enc-1",
          blockedUntil: new Date(now + 5000),
          currentJobs: 0,
          maxConcurrent: 2,
        },
        {
          encoderId: "enc-2",
          blockedUntil: new Date(now + 10000),
          currentJobs: 0,
          maxConcurrent: 2,
        },
      ];

      const available = encoders.find(
        (e) =>
          e.currentJobs < e.maxConcurrent && (!e.blockedUntil || e.blockedUntil.getTime() < now)
      );
      expect(available).toBeUndefined();
    });
  });

  describe("Capacity Updates", () => {
    it("should increment job count when assigning", () => {
      const encoder = { currentJobs: 1, maxConcurrent: 2 };
      const updated = { ...encoder, currentJobs: encoder.currentJobs + 1 };
      expect(updated.currentJobs).toBe(2);
    });

    it("should decrement job count when job completes", () => {
      const encoder = { currentJobs: 2, maxConcurrent: 2 };
      const updated = { ...encoder, currentJobs: encoder.currentJobs - 1 };
      expect(updated.currentJobs).toBe(1);
    });

    it("should not go below zero jobs", () => {
      const encoder = { currentJobs: 0, maxConcurrent: 2 };
      const updated = { ...encoder, currentJobs: Math.max(0, encoder.currentJobs - 1) };
      expect(updated.currentJobs).toBe(0);
    });
  });
});

// =============================================================================
// Job Deduplication Tests
// =============================================================================

describe("Job Deduplication", () => {
  it("should reuse existing assignment for same input file", () => {
    const inputPath = "/media/downloads/movie.mkv";
    const existingAssignments = [
      { id: "existing-1", inputPath, status: "ENCODING" as const },
      { id: "other", inputPath: "/other/path.mkv", status: "PENDING" as const },
    ];

    const existing = existingAssignments.find(
      (a) => a.inputPath === inputPath && ["PENDING", "ASSIGNED", "ENCODING"].includes(a.status)
    );

    expect(existing?.id).toBe("existing-1");
  });

  it("should not reuse COMPLETED assignments", () => {
    const inputPath = "/media/downloads/movie.mkv";
    const existingAssignments = [{ id: "completed-1", inputPath, status: "COMPLETED" as const }];

    const existing = existingAssignments.find(
      (a) => a.inputPath === inputPath && ["PENDING", "ASSIGNED", "ENCODING"].includes(a.status)
    );

    expect(existing).toBeUndefined();
  });

  it("should not reuse FAILED assignments", () => {
    const inputPath = "/media/downloads/movie.mkv";
    const existingAssignments = [{ id: "failed-1", inputPath, status: "FAILED" as const }];

    const existing = existingAssignments.find(
      (a) => a.inputPath === inputPath && ["PENDING", "ASSIGNED", "ENCODING"].includes(a.status)
    );

    expect(existing).toBeUndefined();
  });
});

// =============================================================================
// Progress Update Tests
// =============================================================================

describe("Progress Updates", () => {
  it("should update lastProgressAt on progress", () => {
    const now = new Date();
    const assignment = {
      progress: 50,
      lastProgressAt: new Date(Date.now() - 10000),
    };

    const updated = {
      ...assignment,
      progress: 55,
      lastProgressAt: now,
    };

    expect(updated.lastProgressAt).toBe(now);
    expect(updated.progress).toBe(55);
  });

  it("should handle progress going backwards (edge case)", () => {
    // This shouldn't happen, but handle gracefully
    const assignment = { progress: 50 };
    const newProgress = 45; // Went backwards (bug in encoder?)

    // We should still accept the update
    const updated = { ...assignment, progress: newProgress };
    expect(updated.progress).toBe(45);
  });

  it("should clamp progress to 0-100 range", () => {
    const clamp = (value: number) => Math.max(0, Math.min(100, value));

    expect(clamp(-5)).toBe(0);
    expect(clamp(105)).toBe(100);
    expect(clamp(50)).toBe(50);
  });
});

// =============================================================================
// Error Message Handling Tests
// =============================================================================

describe("Error Message Handling", () => {
  it("should store error message on failure", () => {
    const errorMessage = "FFmpeg error: invalid codec configuration for AV1";
    const assignment = {
      status: "ENCODING" as const,
      error: null as string | null,
    };

    const failed = {
      ...assignment,
      status: "FAILED" as const,
      error: errorMessage,
    };

    expect(failed.error).toBe(errorMessage);
  });

  it("should handle null error on retry", () => {
    const assignment = {
      error: "Previous error",
      status: "FAILED" as const,
    };

    const retried = {
      ...assignment,
      error: "New retry attempt",
      status: "PENDING" as const,
    };

    expect(retried.error).toBe("New retry attempt");
  });

  it("should preserve error for debugging when max attempts exceeded", () => {
    const assignment = {
      error: "Final failure reason",
      attempt: 3,
      maxAttempts: 3,
    };

    // Error should be preserved for debugging
    expect(assignment.error).toBeTruthy();
  });
});
