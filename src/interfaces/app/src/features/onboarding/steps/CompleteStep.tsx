import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import type { OnboardingState } from "../onboarding-flow";
import logo from "@/assets/logo.png";

interface CompleteStepProps {
  state: OnboardingState;
  onComplete: () => void;
  onBack: () => void;
}

export function CompleteStep({ state, onComplete, onBack }: CompleteStepProps) {
  return (
    <div className="max-w-[800px] mx-auto space-y-8 text-center md:text-left">
      <div className="mb-10 text-center">
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-full bg-[#238636]/10 border border-[#238636]/30">
            <CheckCircle2 className="h-12 w-12 text-[#3fb950]" />
          </div>
        </div>
        <h1 className="text-3xl font-semibold text-[#c9d1d9] mb-3">
          You're all set!
        </h1>
        <p className="text-[#8b949e] max-w-[500px] mx-auto text-lg">
          Zuckerman is now configured and ready to assist you.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
          <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
            <h2 className="text-base font-semibold text-[#c9d1d9]">Configuration Summary</h2>
          </div>
          <div className="p-6 space-y-4 bg-[#0d1117] text-left">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-[#3fb950]" />
              <div className="flex-1">
                <div className="text-xs text-[#8b949e] uppercase tracking-wider font-semibold">LLM Provider</div>
                <div className="text-sm text-[#c9d1d9]">
                  {state.llmProvider.provider === "anthropic" ? "Anthropic (Claude)" : state.llmProvider.provider === "openai" ? "OpenAI (GPT)" : state.llmProvider.provider === "openrouter" ? "OpenRouter" : "Mock"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-[#3fb950]" />
              <div className="flex-1">
                <div className="text-xs text-[#8b949e] uppercase tracking-wider font-semibold">Chat Channel</div>
                <div className="text-sm text-[#c9d1d9]">
                  {state.channel.type === "none" ? "None selected" : state.channel.type.charAt(0).toUpperCase() + state.channel.type.slice(1)}
                  {state.channel.connected && " (Connected)"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-[#3fb950]" />
              <div className="flex-1">
                <div className="text-xs text-[#8b949e] uppercase tracking-wider font-semibold">Primary Agent</div>
                <div className="text-sm text-[#c9d1d9]">{state.agent.agentId || "Default"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
          <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
            <h2 className="text-base font-semibold text-[#c9d1d9]">Next Steps</h2>
          </div>
          <div className="p-6 bg-[#0d1117] text-left">
            <ul className="space-y-3 text-sm text-[#8b949e]">
              <li className="flex items-start gap-2">
                <span className="text-[#58a6ff]">•</span>
                <span>Send your first message via the dashboard</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#58a6ff]">•</span>
                <span>Customize your agent's persona in the settings</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#58a6ff]">•</span>
                <span>Connect additional messaging platforms</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#58a6ff]">•</span>
                <span>Explore the system logs in the inspector</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 pt-10 border-t border-[#30363d]">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="text-[#8b949e] hover:text-[#c9d1d9]"
        >
          Back to setup
        </Button>
        <Button 
          onClick={onComplete}
          className="bg-[#238636] hover:bg-[#2ea043] text-white border-[#238636] px-10 h-12 text-lg font-semibold"
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
