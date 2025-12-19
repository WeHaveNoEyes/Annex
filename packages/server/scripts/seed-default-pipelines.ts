#!/usr/bin/env bun
/**
 * Seed Default Pipeline Templates
 *
 * Creates default Movie and TV pipeline templates for the new pipeline system.
 * Run this script once to populate the database with standard workflows.
 */

import { prisma } from "../src/db/client.js";
import { MediaType } from "@prisma/client";

async function seedDefaultPipelines() {
  console.log("🌱 Seeding default pipeline templates...\n");

  // Default Movie Pipeline
  const movieTemplate = await prisma.pipelineTemplate.upsert({
    where: {
      // Use a composite unique key based on name and mediaType
      id: "default-movie-pipeline",
    },
    update: {},
    create: {
      id: "default-movie-pipeline",
      name: "Standard Movie Pipeline",
      description: "Default workflow for movie requests: Search → Download → Encode → Deliver",
      mediaType: MediaType.MOVIE,
      isDefault: true,
      isPublic: true,
      steps: [
        {
          type: "SEARCH",
          name: "Find Release",
          config: {
            minSeeds: 5,
            timeoutSeconds: 300,
          },
          required: true,
          retryable: true,
          continueOnError: false,
          children: [
            {
              type: "DOWNLOAD",
              name: "Download Source",
              config: {
                maxDownloadHours: 24,
                pollInterval: 10000,
              },
              required: true,
              retryable: true,
              continueOnError: false,
              children: [
                {
                  type: "ENCODE",
                  name: "Encode to AV1",
                  config: {
                    crf: 28,
                    maxResolution: "1080p",
                    preset: "medium",
                    pollInterval: 5000,
                    timeout: 43200000, // 12 hours
                  },
                  required: true,
                  retryable: true,
                  continueOnError: false,
                  children: [
                    {
                      type: "DELIVER",
                      name: "Deliver to Servers",
                      config: {
                        verifyDelivery: true,
                      },
                      required: true,
                      retryable: true,
                      continueOnError: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      layout: {
        nodes: [
          {
            id: "start",
            type: "step",
            position: { x: 250, y: 50 },
            data: {
              label: "Request Submitted",
              type: "START",
              config: {},
              required: true,
              retryable: false,
              continueOnError: false,
            },
          },
          {
            id: "step-0",
            type: "step",
            position: { x: 250, y: 150 },
            data: {
              label: "Find Release",
              type: "SEARCH",
              config: { minSeeds: 5, timeoutSeconds: 300 },
              required: true,
              retryable: true,
              continueOnError: false,
            },
          },
          {
            id: "step-1",
            type: "step",
            position: { x: 250, y: 250 },
            data: {
              label: "Download Source",
              type: "DOWNLOAD",
              config: { maxDownloadHours: 24, pollInterval: 10000 },
              required: true,
              retryable: true,
              continueOnError: false,
            },
          },
          {
            id: "step-2",
            type: "step",
            position: { x: 250, y: 350 },
            data: {
              label: "Encode to AV1",
              type: "ENCODE",
              config: { crf: 28, maxResolution: "1080p", preset: "medium", pollInterval: 5000, timeout: 43200000 },
              required: true,
              retryable: true,
              continueOnError: false,
            },
          },
          {
            id: "step-3",
            type: "step",
            position: { x: 250, y: 450 },
            data: {
              label: "Deliver to Servers",
              type: "DELIVER",
              config: { verifyDelivery: true },
              required: true,
              retryable: true,
              continueOnError: false,
            },
          },
        ],
        edges: [
          { id: "e-start-0", source: "start", target: "step-0", type: "default" },
          { id: "e-0-1", source: "step-0", target: "step-1", type: "default" },
          { id: "e-1-2", source: "step-1", target: "step-2", type: "default" },
          { id: "e-2-3", source: "step-2", target: "step-3", type: "default" },
        ],
        viewport: { x: 0, y: 0, zoom: 0.75 },
      },
    },
  });

  console.log(`✅ Created default Movie pipeline: ${movieTemplate.name}`);

  // Default TV Pipeline
  const tvTemplate = await prisma.pipelineTemplate.upsert({
    where: {
      id: "default-tv-pipeline",
    },
    update: {},
    create: {
      id: "default-tv-pipeline",
      name: "Standard TV Pipeline",
      description: "Default workflow for TV requests: Search → Download → Encode → Deliver",
      mediaType: MediaType.TV,
      isDefault: true,
      isPublic: true,
      steps: [
        {
          type: "SEARCH",
          name: "Find Release",
          config: {
            minSeeds: 3, // Lower threshold for TV shows
            timeoutSeconds: 300,
          },
          required: true,
          retryable: true,
          continueOnError: false,
          children: [
            {
              type: "DOWNLOAD",
              name: "Download Source",
              config: {
                maxDownloadHours: 24,
                pollInterval: 10000,
              },
              required: true,
              retryable: true,
              continueOnError: false,
              children: [
                {
                  type: "ENCODE",
                  name: "Encode to AV1",
                  config: {
                    crf: 28,
                    maxResolution: "1080p",
                    preset: "medium",
                    pollInterval: 5000,
                    timeout: 43200000,
                  },
                  required: true,
                  retryable: true,
                  continueOnError: false,
                  children: [
                    {
                      type: "DELIVER",
                      name: "Deliver to Servers",
                      config: {
                        verifyDelivery: true,
                      },
                      required: true,
                      retryable: true,
                      continueOnError: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      layout: {
        nodes: [
          {
            id: "start",
            type: "step",
            position: { x: 250, y: 50 },
            data: {
              label: "Request Submitted",
              type: "START",
              config: {},
              required: true,
              retryable: false,
              continueOnError: false,
            },
          },
          {
            id: "step-0",
            type: "step",
            position: { x: 250, y: 150 },
            data: {
              label: "Find Release",
              type: "SEARCH",
              config: { minSeeds: 3, timeoutSeconds: 300 },
              required: true,
              retryable: true,
              continueOnError: false,
            },
          },
          {
            id: "step-1",
            type: "step",
            position: { x: 250, y: 250 },
            data: {
              label: "Download Source",
              type: "DOWNLOAD",
              config: { maxDownloadHours: 24, pollInterval: 10000 },
              required: true,
              retryable: true,
              continueOnError: false,
            },
          },
          {
            id: "step-2",
            type: "step",
            position: { x: 250, y: 350 },
            data: {
              label: "Encode to AV1",
              type: "ENCODE",
              config: { crf: 28, maxResolution: "1080p", preset: "medium", pollInterval: 5000, timeout: 43200000 },
              required: true,
              retryable: true,
              continueOnError: false,
            },
          },
          {
            id: "step-3",
            type: "step",
            position: { x: 250, y: 450 },
            data: {
              label: "Deliver to Servers",
              type: "DELIVER",
              config: { verifyDelivery: true },
              required: true,
              retryable: true,
              continueOnError: false,
            },
          },
        ],
        edges: [
          { id: "e-start-0", source: "start", target: "step-0", type: "default" },
          { id: "e-0-1", source: "step-0", target: "step-1", type: "default" },
          { id: "e-1-2", source: "step-1", target: "step-2", type: "default" },
          { id: "e-2-3", source: "step-2", target: "step-3", type: "default" },
        ],
        viewport: { x: 0, y: 0, zoom: 0.75 },
      },
    },
  });

  console.log(`✅ Created default TV pipeline: ${tvTemplate.name}`);

  console.log("\n✨ Default pipeline templates seeded successfully!");
  console.log("\nTo use these templates:");
  console.log("  - They will be auto-selected for new requests");
  console.log("  - Users can view/edit them in Settings → Pipelines");
  console.log("  - Users can create custom templates based on these");
}

// Run the seed function
seedDefaultPipelines()
  .then(() => {
    console.log("\n✅ Seed completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Seed failed:", error);
    process.exit(1);
  });
