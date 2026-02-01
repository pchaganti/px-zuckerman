import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { GatewayClient } from "../../../core/gateway/client";
import { Server, Palette, Settings as SettingsIcon, CheckCircle2, XCircle, Power, Loader2 } from "lucide-react";
import { useGateway } from "../../../hooks/use-gateway";
import { GatewayLogsViewer } from "../../../components/gateway-logs-viewer";

interface SettingsProps {
  gatewayClient: GatewayClient | null;
  onClose?: () => void;
  onGatewayConfigChange?: (host: string, port: number) => void;
}

type SettingsTab = "gateway" | "appearance" | "advanced";

interface SettingsState {
  gateway: {
    host: string;
    port: number;
    autoStart: boolean;
  };
  appearance: {
    theme: "light" | "dark" | "system";
    fontSize: string;
  };
  advanced: {
    autoReconnect: boolean;
    reconnectAttempts: number;
  };
}

export function SettingsView({
  gatewayClient,
  onClose,
  onGatewayConfigChange,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("gateway");
  const [settings, setSettings] = useState<SettingsState>(() => {
    const stored = localStorage.getItem("zuckerman:settings");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Fallback to defaults
      }
    }
    return {
      gateway: {
        host: "127.0.0.1",
        port: 18789,
        autoStart: true,
      },
      appearance: {
        theme: "system",
        fontSize: "14",
      },
      advanced: {
        autoReconnect: true,
        reconnectAttempts: 5,
      },
    };
  });

  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [hasChanges, setHasChanges] = useState(false);
  
  const {
    serverStatus,
    isServerLoading,
    isServerStarting,
    isServerStopping,
    startServer,
    stopServer,
    checkServerStatus,
    startPolling,
    stopPolling,
  } = useGateway();

  useEffect(() => {
    // Load current settings when component mounts
    const stored = localStorage.getItem("zuckerman:settings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings(parsed);
        // Check gateway status with loaded settings
        if (window.electronAPI && parsed.gateway) {
          checkServerStatus(parsed.gateway.host, parsed.gateway.port);
        }
      } catch {}
    } else {
      // Check gateway status with default settings
      if (window.electronAPI) {
        checkServerStatus(settings.gateway.host, settings.gateway.port);
      }
    }
    setHasChanges(false);
    setConnectionStatus("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check gateway status when settings change
  useEffect(() => {
    if (window.electronAPI && activeTab === "gateway") {
      checkServerStatus(settings.gateway.host, settings.gateway.port);
      // Start polling when on gateway tab
      startPolling(settings.gateway.host, settings.gateway.port, 5000);
    } else {
      // Stop polling when leaving gateway tab
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [settings.gateway.host, settings.gateway.port, activeTab, checkServerStatus, startPolling, stopPolling]);

  const handleSave = () => {
    localStorage.setItem("zuckerman:settings", JSON.stringify(settings));
    
    // Apply gateway config changes if provided
    if (onGatewayConfigChange && hasChanges) {
      onGatewayConfigChange(settings.gateway.host, settings.gateway.port);
    }

    // Apply theme if changed
    if (settings.appearance.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (settings.appearance.theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      // System theme - check system preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    setHasChanges(false);
  };

  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    try {
      const testClient = new GatewayClient({
        host: settings.gateway.host,
        port: settings.gateway.port,
      });
      
      await Promise.race([
        testClient.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Connection timeout")), 5000)
        ),
      ]) as Promise<void>;
      
      testClient.disconnect();
      setConnectionStatus("success");
      setTimeout(() => setConnectionStatus("idle"), 3000);
    } catch (error) {
      setConnectionStatus("error");
      setTimeout(() => setConnectionStatus("idle"), 3000);
    }
  };

  const updateSettings = <K extends keyof SettingsState>(
    section: K,
    updates: Partial<SettingsState[K]>
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...updates },
    }));
    setHasChanges(true);
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "gateway", label: "Gateway", icon: <Server className="h-4 w-4" /> },
    { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
    { id: "advanced", label: "Advanced", icon: <SettingsIcon className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-6 py-8">
          {/* GitHub-style header */}
          <div className="mb-8 pb-6 border-b border-border">
            <div className="flex items-center gap-1 mb-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                    ${activeTab === tab.id 
                      ? "bg-accent text-accent-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}
                  `}
                >
                  <div className="flex items-center gap-2">
                    {tab.icon}
                    {tab.label}
                  </div>
                </button>
              ))}
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              {tabs.find(t => t.id === activeTab)?.label}
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeTab === "gateway" && "Turn the gateway server on or off."}
              {activeTab === "appearance" && "Customize how the application looks and feels."}
              {activeTab === "advanced" && "Configure gateway connection settings and advanced options."}
            </p>
          </div>

          <div className="space-y-6">
            {activeTab === "gateway" && (
              <React.Fragment>
                {/* GitHub-style section */}
                <div className="border border-border rounded-md bg-card">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-foreground">Gateway Server</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {window.electronAPI 
                        ? "Control the gateway server process."
                        : "Gateway management requires Electron API."}
                    </p>
                  </div>
                  <div className="px-6 py-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {serverStatus && (
                          <div className="flex items-center gap-2 text-sm">
                            {serverStatus.running ? (
                              <>
                                <div className="h-2 w-2 rounded-full bg-[#3fb950]"></div>
                                <span className="text-muted-foreground">Running</span>
                              </>
                            ) : (
                              <>
                                <div className="h-2 w-2 rounded-full bg-muted-foreground"></div>
                                <span className="text-muted-foreground">Stopped</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      {window.electronAPI && (
                        <Button
                          variant={serverStatus?.running ? "destructive" : "default"}
                          size="default"
                          onClick={async () => {
                            if (serverStatus?.running) {
                              const success = await stopServer(
                                settings.gateway.host,
                                settings.gateway.port
                              );
                              if (success && gatewayClient) {
                                gatewayClient.disconnect();
                              }
                            } else {
                              const success = await startServer(
                                settings.gateway.host,
                                settings.gateway.port
                              );
                              if (success && gatewayClient) {
                                setTimeout(() => {
                                  gatewayClient.connect().catch(() => {
                                    // Connection will be handled by App component
                                  });
                                }, 1000);
                              }
                            }
                          }}
                          disabled={isServerStopping || isServerStarting}
                        >
                          {isServerStopping ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Turning off...
                            </>
                          ) : isServerStarting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Turning on...
                            </>
                          ) : serverStatus?.running ? (
                            <>
                              <Power className="h-4 w-4 mr-2" />
                              Turn Off
                            </>
                          ) : (
                            <>
                              <Power className="h-4 w-4 mr-2" />
                              Turn On
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {serverStatus?.error && (
                      <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-md">
                        {serverStatus.error}
                      </div>
                    )}
                  </div>
                </div>

                {/* Auto-start option */}
                <div className="border border-border rounded-md bg-card">
                  <div className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="gateway-auto-start"
                        checked={settings.gateway.autoStart}
                        onCheckedChange={(checked) =>
                          updateSettings("gateway", {
                            autoStart: checked === true,
                          })
                        }
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <Label htmlFor="gateway-auto-start" className="cursor-pointer text-sm font-medium text-foreground">
                          Auto-start gateway on app launch
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Automatically start the gateway server when the app launches.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Test connection */}
                <div className="border border-border rounded-md bg-card">
                  <div className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTestConnection}
                        disabled={connectionStatus === "testing"}
                      >
                        {connectionStatus === "testing" && "Testing..."}
                        {connectionStatus === "idle" && "Test connection"}
                        {connectionStatus === "success" && (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Connected
                          </>
                        )}
                        {connectionStatus === "error" && (
                          <>
                            <XCircle className="h-4 w-4 mr-2" />
                            Connection failed
                          </>
                        )}
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        Verify that the gateway is reachable with current settings.
                      </p>
                    </div>
                  </div>
                </div>

                {window.electronAPI && (
                  <div className="border border-border rounded-md bg-card">
                    <div className="px-6 py-4 border-b border-border">
                      <h2 className="text-base font-semibold text-foreground">Gateway Logs</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        View real-time logs from the gateway server process.
                      </p>
                    </div>
                    <div className="px-6 py-4">
                      <GatewayLogsViewer limit={200} />
                    </div>
                  </div>
                )}
              </React.Fragment>
            )}

            {activeTab === "appearance" && (
              <div className="border border-border rounded-md bg-card">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-base font-semibold text-foreground">Appearance</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Customize how the application looks and feels.
                  </p>
                </div>
                <div className="px-6 py-4 space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="theme" className="text-sm font-medium text-foreground">
                      Theme preference
                    </Label>
                    <Select
                      value={settings.appearance.theme}
                      onValueChange={(value: "light" | "dark" | "system") =>
                        updateSettings("appearance", { theme: value })
                      }
                    >
                      <SelectTrigger id="theme" className="w-[240px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">Sync with system</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Choose how Zuckerman looks to you.
                    </p>
                  </div>

                  <div className="border-t border-border pt-6 space-y-2">
                    <Label htmlFor="font-size" className="text-sm font-medium text-foreground">
                      Text size
                    </Label>
                    <Select
                      value={settings.appearance.fontSize}
                      onValueChange={(value) =>
                        updateSettings("appearance", { fontSize: value })
                      }
                    >
                      <SelectTrigger id="font-size" className="w-[240px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12">12px (Small)</SelectItem>
                        <SelectItem value="14">14px (Medium)</SelectItem>
                        <SelectItem value="16">16px (Large)</SelectItem>
                        <SelectItem value="18">18px (Extra Large)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Adjust the font size for the chat and interface.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "advanced" && (
              <React.Fragment>
                <div className="border border-border rounded-md bg-card">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-foreground">Gateway Configuration</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Configure gateway connection settings.
                    </p>
                  </div>
                  <div className="px-6 py-4 space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="gateway-host" className="text-sm font-medium text-foreground">
                        Gateway Host
                      </Label>
                      <Input
                        id="gateway-host"
                        value={settings.gateway.host}
                        onChange={(e) =>
                          updateSettings("gateway", { host: e.target.value })
                        }
                        placeholder="127.0.0.1"
                        className="max-w-md"
                      />
                      <p className="text-sm text-muted-foreground">
                        The hostname or IP address of your Zuckerman Gateway. Default is 127.0.0.1.
                      </p>
                    </div>

                    <div className="border-t border-border pt-6 space-y-2">
                      <Label htmlFor="gateway-port" className="text-sm font-medium text-foreground">
                        Gateway Port
                      </Label>
                      <Input
                        id="gateway-port"
                        type="number"
                        value={settings.gateway.port}
                        onChange={(e) =>
                          updateSettings("gateway", {
                            port: parseInt(e.target.value) || 18789,
                          })
                        }
                        placeholder="18789"
                        min="1"
                        max="65535"
                        className="w-32"
                      />
                      <p className="text-sm text-muted-foreground">
                        The port number the gateway is listening on. Default is 18789.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border border-border rounded-md bg-card">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-foreground">Connection Settings</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Configure advanced connection behavior.
                    </p>
                  </div>
                  <div className="px-6 py-4 space-y-6">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="auto-reconnect"
                        checked={settings.advanced.autoReconnect}
                        onCheckedChange={(checked) =>
                          updateSettings("advanced", {
                            autoReconnect: checked === true,
                          })
                        }
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <Label htmlFor="auto-reconnect" className="cursor-pointer text-sm font-medium text-foreground">
                          Auto-reconnect
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Automatically attempt to reconnect to the gateway if the connection is lost.
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-border pt-6 space-y-2">
                      <Label htmlFor="reconnect-attempts" className="text-sm font-medium text-foreground">
                        Maximum reconnection attempts
                      </Label>
                      <Input
                        id="reconnect-attempts"
                        type="number"
                        value={settings.advanced.reconnectAttempts}
                        onChange={(e) =>
                          updateSettings("advanced", {
                            reconnectAttempts: parseInt(e.target.value) || 5,
                          })
                        }
                        min="1"
                        max="20"
                        className="w-24"
                      />
                      <p className="text-sm text-muted-foreground">
                        How many times the application will try to reconnect before showing an error.
                      </p>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            )}
          </div>
        </div>
      </div>
      
      {hasChanges && (
        <div className="border-t border-border bg-card px-6 py-4 flex items-center justify-end">
          <Button 
            onClick={handleSave}
            className="bg-[#0969da] hover:bg-[#0860ca] text-white"
          >
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}
