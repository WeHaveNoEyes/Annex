// Email notification provider (SMTP)

import { NotificationProvider } from "@prisma/client";
import type { BaseNotificationProvider } from "../NotificationDispatcher.js";
import type { NotificationPayload, NotificationResult } from "../types.js";

interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure?: boolean; // TLS
  smtpUser: string;
  smtpPassword: string;
  fromAddress: string;
  fromName?: string;
  toAddress: string;
}

export class EmailProvider implements BaseNotificationProvider {
  async send(
    _payload: NotificationPayload,
    config: Record<string, unknown>
  ): Promise<NotificationResult> {
    const cfg = config as unknown as EmailConfig;

    // Validate config
    if (
      !cfg.smtpHost ||
      !cfg.smtpPort ||
      !cfg.smtpUser ||
      !cfg.smtpPassword ||
      !cfg.fromAddress ||
      !cfg.toAddress
    ) {
      return {
        success: false,
        provider: NotificationProvider.EMAIL,
        configId: "",
        error: "Missing required SMTP config fields",
      };
    }

    // For now, return a placeholder since we need an SMTP library
    // TODO: Implement actual email sending using nodemailer or similar
    return {
      success: false,
      provider: NotificationProvider.EMAIL,
      configId: "",
      error: "Email provider not yet implemented - requires SMTP library",
    };

    /*
    // Example implementation with nodemailer (requires: bun add nodemailer)
    try {
      const transporter = nodemailer.createTransport({
        host: cfg.smtpHost,
        port: cfg.smtpPort,
        secure: cfg.smtpSecure !== false,
        auth: {
          user: cfg.smtpUser,
          pass: cfg.smtpPassword,
        },
      });

      const subject = this.buildSubject(payload);
      const html = this.buildHtml(payload);

      const info = await transporter.sendMail({
        from: cfg.fromName ? `"${cfg.fromName}" <${cfg.fromAddress}>` : cfg.fromAddress,
        to: cfg.toAddress,
        subject,
        html,
      });

      return {
        success: true,
        provider: NotificationProvider.EMAIL,
        configId: "",
        deliveryId: info.messageId,
      };
    } catch (error) {
      return {
        success: false,
        provider: NotificationProvider.EMAIL,
        configId: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    */
  }
}
