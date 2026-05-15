import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { usePatchboardStore } from "../../../stores/patchboard-store";
import type {
  SocketMethod,
  MethodParam,
  CreateSocketInput,
} from "../../../types/patchboard-types";
import { useT } from "../../../lib/i18n";

interface SocketEditorProps {
  socketId: string | null; // null = create mode
  onClose: () => void;
}

export function SocketEditor({ socketId, onClose }: SocketEditorProps) {
  const t = useT();
  const createSocket = usePatchboardStore((s) => s.createSocket);
  const updateSocket = usePatchboardStore((s) => s.updateSocket);
  const getSocket = usePatchboardStore((s) => s.getSocket);

  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [methods, setMethods] = useState<SocketMethod[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (socketId) {
      getSocket(socketId).then((s) => {
        setFullName(s.fullName);
        setDisplayName(s.displayName);
        setMethods(s.methods);
      });
    }
  }, [socketId, getSocket]);

  const addMethod = () => {
    setMethods([
      ...methods,
      { name: "", params: [], returnType: "void" },
    ]);
  };

  const removeMethod = (idx: number) => {
    setMethods(methods.filter((_, i) => i !== idx));
  };

  const updateMethod = (idx: number, patch: Partial<SocketMethod>) => {
    setMethods(
      methods.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    );
  };

  const addParam = (methodIdx: number) => {
    const method = methods[methodIdx];
    updateMethod(methodIdx, {
      params: [
        ...method.params,
        { name: "", paramType: "string", optional: false },
      ],
    });
  };

  const updateParam = (
    methodIdx: number,
    paramIdx: number,
    patch: Partial<MethodParam>,
  ) => {
    const method = methods[methodIdx];
    const newParams = method.params.map((p, i) =>
      i === paramIdx ? { ...p, ...patch } : p,
    );
    updateMethod(methodIdx, { params: newParams });
  };

  const removeParam = (methodIdx: number, paramIdx: number) => {
    const method = methods[methodIdx];
    updateMethod(methodIdx, {
      params: method.params.filter((_, i) => i !== paramIdx),
    });
  };

  const handleSave = async () => {
    if (!fullName || !displayName) return;
    setLoading(true);
    try {
      if (socketId) {
        await updateSocket({
          id: socketId,
          fullName,
          displayName,
          methods,
        });
      } else {
        const input: CreateSocketInput = {
          fullName,
          displayName,
          extends: [],
          methods,
        };
        await createSocket(input);
      }
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-secondary"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="text-xs font-medium text-text-secondary">
          {socketId ? "Edit Socket" : "New Socket"}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-3 flex flex-col gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted">
            Full Name
          </label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("patchboard.fullNamePlaceholder")}
            className="w-full mt-0.5 px-2 py-1 text-xs bg-bg-primary border border-border rounded text-text-primary focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted">
            Display Name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("patchboard.displayNamePlaceholder")}
            className="w-full mt-0.5 px-2 py-1 text-xs bg-bg-primary border border-border rounded text-text-primary focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-wider text-text-muted">
              Methods
            </label>
            <button
              onClick={addMethod}
              className="text-text-muted hover:text-text-secondary"
            >
              <Plus size={12} />
            </button>
          </div>
          <div className="flex flex-col gap-2 mt-1">
            {methods.map((method, mi) => (
              <div
                key={mi}
                className="border border-border rounded p-2 bg-bg-primary"
              >
                <div className="flex items-center gap-1">
                  <input
                    value={method.name}
                    onChange={(e) =>
                      updateMethod(mi, { name: e.target.value })
                    }
                    placeholder={t("patchboard.methodNamePlaceholder")}
                    className="flex-1 px-1.5 py-0.5 text-[11px] bg-transparent border border-border rounded text-text-primary focus:border-accent focus:outline-none"
                  />
                  <span className="text-[10px] text-text-muted">→</span>
                  <input
                    value={method.returnType}
                    onChange={(e) =>
                      updateMethod(mi, { returnType: e.target.value })
                    }
                    placeholder={t("patchboard.returnTypePlaceholder")}
                    className="w-20 px-1.5 py-0.5 text-[11px] bg-transparent border border-border rounded text-text-primary focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={() => removeMethod(mi)}
                    className="text-text-muted hover:text-error"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
                {/* Params */}
                <div className="mt-1 flex flex-col gap-0.5">
                  {method.params.map((param, pi) => (
                    <div key={pi} className="flex items-center gap-1 ml-2">
                      <input
                        value={param.name}
                        onChange={(e) =>
                          updateParam(mi, pi, { name: e.target.value })
                        }
                        placeholder={t("patchboard.paramPlaceholder")}
                        className="w-16 px-1 py-0.5 text-[10px] bg-transparent border border-border rounded text-text-primary focus:border-accent focus:outline-none"
                      />
                      <span className="text-[10px] text-text-muted">:</span>
                      <input
                        value={param.paramType}
                        onChange={(e) =>
                          updateParam(mi, pi, {
                            paramType: e.target.value,
                          })
                        }
                        placeholder={t("patchboard.typePlaceholder")}
                        className="w-16 px-1 py-0.5 text-[10px] bg-transparent border border-border rounded text-text-primary focus:border-accent focus:outline-none"
                      />
                      <button
                        onClick={() => removeParam(mi, pi)}
                        className="text-text-muted hover:text-error"
                      >
                        <Trash2 size={9} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addParam(mi)}
                    className="ml-2 text-[10px] text-text-muted hover:text-text-secondary"
                  >
                    + param
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-border">
        <button
          onClick={handleSave}
          disabled={loading || !fullName || !displayName}
          className="w-full px-3 py-1.5 text-xs rounded bg-accent text-bg-primary font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {loading ? "Saving..." : socketId ? "Update" : "Create"}
        </button>
      </div>
    </div>
  );
}
