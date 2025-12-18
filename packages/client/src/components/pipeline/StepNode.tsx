import { Handle, Position } from "@xyflow/react";

interface StepNodeData {
  label: string;
  type: "START" | "SEARCH" | "DOWNLOAD" | "ENCODE" | "DELIVER" | "APPROVAL" | "NOTIFICATION";
  config: Record<string, unknown>;
  required: boolean;
  retryable: boolean;
  continueOnError: boolean;
}

interface StepNodeProps {
  data: StepNodeData;
  selected?: boolean;
}

export default function StepNode({ data, selected }: StepNodeProps) {
  const getIcon = () => {
    const icons: Record<StepNodeData["type"], string> = {
      START: "🎬",
      SEARCH: "🔍",
      DOWNLOAD: "⬇️",
      ENCODE: "🎬",
      DELIVER: "📦",
      APPROVAL: "✋",
      NOTIFICATION: "🔔",
    };
    return icons[data.type];
  };

  const getColor = () => {
    const colors: Record<StepNodeData["type"], string> = {
      START: "from-annex-500 to-annex-600",
      SEARCH: "from-blue-500 to-blue-600",
      DOWNLOAD: "from-purple-500 to-purple-600",
      ENCODE: "from-orange-500 to-orange-600",
      DELIVER: "from-green-500 to-green-600",
      APPROVAL: "from-gold-500 to-yellow-600",
      NOTIFICATION: "from-cyan-500 to-cyan-600",
    };
    return colors[data.type];
  };

  return (
    <div
      className={`
        px-4 py-3 rounded border-2 min-w-[200px]
        bg-gradient-to-br ${getColor()}
        ${selected ? "border-white shadow-xl" : "border-transparent shadow-lg"}
        transition-all duration-150
      `}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-white" />

      <div className="flex items-center gap-3">
        <span className="text-2xl">{getIcon()}</span>
        <div className="flex-1">
          <div className="text-white font-semibold">{data.label}</div>
          <div className="text-white/80 text-xs">
            {data.type === "START" ? "Trigger" : data.type.toLowerCase()}
          </div>
        </div>
      </div>

      {data.type !== "START" && (
        <div className="mt-2 flex gap-1 text-xs text-white/70">
          {data.required && <span className="bg-white/20 px-1 rounded">Required</span>}
          {data.retryable && <span className="bg-white/20 px-1 rounded">Retryable</span>}
          {data.continueOnError && <span className="bg-white/20 px-1 rounded">Continue on error</span>}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-white" />
    </div>
  );
}
