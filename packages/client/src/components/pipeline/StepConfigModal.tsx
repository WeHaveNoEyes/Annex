import { useState, useEffect } from "react";
import { Button, Input, Card, Label, Select } from "../ui";

interface StepNodeData {
  label: string;
  type: "START" | "SEARCH" | "DOWNLOAD" | "ENCODE" | "DELIVER" | "APPROVAL" | "NOTIFICATION";
  config: Record<string, unknown>;
  required: boolean;
  retryable: boolean;
  continueOnError: boolean;
}

interface StepConfigModalProps {
  nodeId: string;
  nodeData: StepNodeData;
  onClose: () => void;
  onUpdate: (updates: Partial<StepNodeData>) => void;
}

export default function StepConfigModal({ nodeData, onClose, onUpdate }: StepConfigModalProps) {
  const [label, setLabel] = useState(nodeData.label);
  const [required, setRequired] = useState(nodeData.required);
  const [retryable, setRetryable] = useState(nodeData.retryable);
  const [continueOnError, setContinueOnError] = useState(nodeData.continueOnError);
  const [config, setConfig] = useState(nodeData.config);

  useEffect(() => {
    setLabel(nodeData.label);
    setRequired(nodeData.required);
    setRetryable(nodeData.retryable);
    setContinueOnError(nodeData.continueOnError);
    setConfig(nodeData.config);
  }, [nodeData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({
      label,
      required,
      retryable,
      continueOnError,
      config,
    });
  };

  const renderConfigFields = () => {
    switch (nodeData.type) {
      case "SEARCH":
        return (
          <div className="space-y-3">
            <div>
              <Label>Minimum Seeds</Label>
              <Input
                type="number"
                value={(config.minSeeds as number) || 1}
                onChange={(e) => setConfig({ ...config, minSeeds: parseInt(e.target.value) || 1 })}
                min={0}
              />
            </div>
            <div>
              <Label>Timeout (seconds)</Label>
              <Input
                type="number"
                value={(config.timeoutSeconds as number) || 300}
                onChange={(e) => setConfig({ ...config, timeoutSeconds: parseInt(e.target.value) || 300 })}
                min={10}
              />
            </div>
          </div>
        );

      case "DOWNLOAD":
        return (
          <div className="space-y-3">
            <div>
              <Label>Max Download Time (hours)</Label>
              <Input
                type="number"
                value={(config.maxDownloadHours as number) || 24}
                onChange={(e) => setConfig({ ...config, maxDownloadHours: parseInt(e.target.value) || 24 })}
                min={1}
              />
            </div>
          </div>
        );

      case "ENCODE":
        return (
          <div className="space-y-3">
            <div>
              <Label>Target Quality (CRF)</Label>
              <Input
                type="number"
                value={(config.crf as number) || 28}
                onChange={(e) => setConfig({ ...config, crf: parseInt(e.target.value) || 28 })}
                min={0}
                max={51}
              />
              <p className="text-xs text-white/50 mt-1">Lower = better quality (18-28 recommended)</p>
            </div>
            <div>
              <Label>Max Resolution</Label>
              <Select
                value={(config.maxResolution as string) || "1080p"}
                onChange={(e) => setConfig({ ...config, maxResolution: e.target.value })}
                className="w-full"
              >
                <option value="480p">480p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="2160p">4K (2160p)</option>
              </Select>
            </div>
          </div>
        );

      case "DELIVER":
        return (
          <div className="space-y-3">
            <div>
              <Label>Verify Delivery</Label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(config.verifyDelivery as boolean) ?? true}
                  onChange={(e) => setConfig({ ...config, verifyDelivery: e.target.checked })}
                />
                <span className="text-sm text-white/70">Verify file integrity after delivery</span>
              </label>
            </div>
          </div>
        );

      case "APPROVAL":
        return (
          <div className="space-y-3">
            <div>
              <Label>Timeout (hours)</Label>
              <Input
                type="number"
                value={(config.timeoutHours as number) || 24}
                onChange={(e) => setConfig({ ...config, timeoutHours: parseInt(e.target.value) || 24 })}
                min={1}
              />
              <p className="text-xs text-white/50 mt-1">Auto-reject if not approved within timeout</p>
            </div>
            <div>
              <Label>Default Action on Timeout</Label>
              <Select
                value={(config.defaultAction as string) || "REJECT"}
                onChange={(e) => setConfig({ ...config, defaultAction: e.target.value })}
                className="w-full"
              >
                <option value="APPROVE">Approve</option>
                <option value="REJECT">Reject</option>
              </Select>
            </div>
          </div>
        );

      case "NOTIFICATION":
        return (
          <div className="space-y-3">
            <div>
              <Label>Event Type</Label>
              <Select
                value={(config.event as string) || "REQUEST_SUBMITTED"}
                onChange={(e) => setConfig({ ...config, event: e.target.value })}
                className="w-full"
              >
                <option value="REQUEST_SUBMITTED">Request Submitted</option>
                <option value="REQUEST_COMPLETED">Request Completed</option>
                <option value="REQUEST_FAILED">Request Failed</option>
                <option value="APPROVAL_REQUIRED">Approval Required</option>
              </Select>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex" onClick={onClose}>
      <div className="flex-1" />
      <Card
        className="w-full max-w-md h-full overflow-y-auto p-6 rounded-none border-l border-white/10 animate-slide-in-right"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">
            Configure {nodeData.type} Step
          </h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors"
            type="button"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Step Name</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Enter step name"
              required
            />
          </div>

          {renderConfigFields()}

          <div className="pt-4 border-t border-white/10">
            <h3 className="text-sm font-semibold text-white mb-3">Behavior</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                />
                <span className="text-sm text-white/70">
                  Required - Pipeline fails if this step fails
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={retryable}
                  onChange={(e) => setRetryable(e.target.checked)}
                />
                <span className="text-sm text-white/70">
                  Retryable - Allow manual retry on failure
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={continueOnError}
                  onChange={(e) => setContinueOnError(e.target.checked)}
                />
                <span className="text-sm text-white/70">
                  Continue on error - Don't halt pipeline on failure
                </span>
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit">Save Changes</Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
